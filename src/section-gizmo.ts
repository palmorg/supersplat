import { Entity, TranslateGizmo, Vec3 } from 'playcanvas';

import { SectionState } from './cross-section';
import { Events } from './events';
import { Scene } from './scene';

type Axis = 'x' | 'y' | 'z';
type FaceDef = { axis: Axis, side: 'min' | 'max' };

const faceDefs: FaceDef[] = [
    { axis: 'x', side: 'min' },
    { axis: 'x', side: 'max' },
    { axis: 'y', side: 'min' },
    { axis: 'y', side: 'max' },
    { axis: 'z', side: 'min' },
    { axis: 'z', side: 'max' }
];

// all translate-gizmo shapes; we enable only the single perpendicular axis per handle
const shapeAxes = ['x', 'y', 'z', 'xy', 'yz', 'xz', 'xyz'] as const;

// euler rotation (degrees) that flips a handle's enabled axis to point in the
// negative direction, used with 'local' coord space so the 'max' face arrows
// point inward (towards the 'min' face) rather than outward
const flipEuler: Record<Axis, [number, number, number]> = {
    x: [0, 180, 0],
    y: [180, 0, 0],
    z: [0, 180, 0]
};

const component = (v: Vec3, axis: Axis) => (axis === 'x' ? v.x : axis === 'y' ? v.y : v.z);

// In-viewport drag handles for the cross-section box. Each of the 6 faces gets a
// single-axis TranslateGizmo the user can grab and drag to move that face along
// its axis. Handles are created lazily the first time the section is enabled.
const registerSectionGizmos = (events: Events, scene: Scene) => {
    const bmin = new Vec3(-1, -1, -1);
    const bmax = new Vec3(1, 1, 1);
    const tmp = new Vec3();

    let enabled = false;
    let dragging = false;

    type Handle = { def: FaceDef, entity: Entity, gizmo: TranslateGizmo };
    let handles: Handle[] | null = null;

    // world position of a face's centre handle
    const faceCenter = (def: FaceDef, out: Vec3) => {
        const cx = (bmin.x + bmax.x) * 0.5;
        const cy = (bmin.y + bmax.y) * 0.5;
        const cz = (bmin.z + bmax.z) * 0.5;
        const face = def.side === 'min' ? bmin : bmax;
        out.set(
            def.axis === 'x' ? face.x : cx,
            def.axis === 'y' ? face.y : cy,
            def.axis === 'z' ? face.z : cz
        );
        return out;
    };

    const gizmoSize = () => {
        const { camera, canvas } = scene;
        return camera.ortho ?
            1125 / canvas.clientHeight :
            1200 / Math.max(canvas.clientWidth, canvas.clientHeight);
    };

    // snap handles back onto their faces (skipped for the handle being dragged)
    const reposition = () => {
        if (!handles || dragging) {
            return;
        }
        handles.forEach(({ def, entity }) => {
            entity.setPosition(faceCenter(def, tmp));
        });
    };

    const ensureHandles = () => {
        if (handles) {
            return;
        }
        const camera = scene.camera.camera;
        const layer = scene.gizmoLayer;
        const size = gizmoSize();

        handles = faceDefs.map((def) => {
            const entity = new Entity(`section-handle-${def.axis}-${def.side}`);
            scene.app.root.addChild(entity);
            entity.setPosition(faceCenter(def, tmp));
            // point 'max' face arrows back towards the 'min' face on the same axis
            if (def.side === 'max') {
                const [ex, ey, ez] = flipEuler[def.axis];
                entity.setLocalEulerAngles(ex, ey, ez);
            }

            const gizmo = new TranslateGizmo(camera, layer);
            shapeAxes.forEach(s => gizmo.enableShape(s, s === def.axis));
            // 'local' space so the arrow follows the handle's (possibly flipped) axis
            gizmo.coordSpace = 'local';
            gizmo.size = size;
            gizmo.attach([entity]);
            gizmo.enabled = enabled;

            gizmo.on('render:update', () => {
                scene.forceRender = true;
            });
            gizmo.on('transform:start', () => {
                dragging = true;
            });
            gizmo.on('transform:move', () => {
                events.fire('section.setBound', def.axis, def.side, component(entity.getPosition(), def.axis));
            });
            gizmo.on('transform:end', () => {
                dragging = false;
                reposition();
            });

            return { def, entity, gizmo };
        });
    };

    const setEnabled = (value: boolean) => {
        enabled = value;
        if (enabled) {
            ensureHandles();
        }
        handles?.forEach(h => (h.gizmo.enabled = enabled));
        scene.forceRender = true;
    };

    events.on('section.changed', (s: SectionState) => {
        bmin.set(s.min.x, s.min.y, s.min.z);
        bmax.set(s.max.x, s.max.y, s.max.z);
        if (s.enabled !== enabled) {
            setEnabled(s.enabled);
        }
        reposition();
    });

    const updateSize = () => {
        if (handles) {
            const size = gizmoSize();
            handles.forEach(h => (h.gizmo.size = size));
        }
    };
    events.on('camera.resize', updateSize);
    events.on('camera.ortho', updateSize);

    // seed from current section state (in case it is already enabled)
    const initial = events.invoke('section.state') as SectionState | undefined;
    if (initial) {
        bmin.set(initial.min.x, initial.min.y, initial.min.z);
        bmax.set(initial.max.x, initial.max.y, initial.max.z);
        if (initial.enabled) {
            setEnabled(true);
        }
    }
};

export { registerSectionGizmos };
