import { Color, Vec3 } from 'playcanvas';

import { Events } from './events';
import { Scene } from './scene';

type Axis = 'x' | 'y' | 'z';

// State payload broadcast on 'section.changed'
type SectionState = {
    enabled: boolean;
    min: { x: number, y: number, z: number };
    max: { x: number, y: number, z: number };
    boundMin: { x: number, y: number, z: number };
    boundMax: { x: number, y: number, z: number };
};

// Wire up the non-destructive cross-section feature. The section is an
// axis-aligned box in world space; gaussians whose centers fall outside it are
// discarded in the splat vertex shader (see splat-shader.ts). Nothing is
// modified on disk - toggling the section off restores the full model.
const registerCrossSectionEvents = (events: Events, scene: Scene) => {
    const device = scene.app.graphicsDevice;

    const min = new Vec3(-1, -1, -1);
    const max = new Vec3(1, 1, 1);

    let enabled = false;
    // whether the user has dragged a face - once customized we stop
    // auto-fitting the box to the scene bound on load
    let customized = false;

    const boxColor = new Color(1.0, 0.6, 0.1, 1.0);

    const state = (): SectionState => {
        const bMin = scene.bound.getMin();
        const bMax = scene.bound.getMax();
        return {
            enabled,
            min: { x: min.x, y: min.y, z: min.z },
            max: { x: max.x, y: max.y, z: max.z },
            boundMin: { x: bMin.x, y: bMin.y, z: bMin.z },
            boundMax: { x: bMax.x, y: bMax.y, z: bMax.z }
        };
    };

    const applyUniforms = () => {
        device.scope.resolve('clipEnabled').setValue(enabled ? 1 : 0);
        device.scope.resolve('clipMin').setValue([min.x, min.y, min.z]);
        device.scope.resolve('clipMax').setValue([max.x, max.y, max.z]);
    };

    const changed = () => {
        applyUniforms();
        scene.forceRender = true;
        events.fire('section.changed', state());
    };

    // fit the section box to the current scene bound
    const fitToBound = () => {
        min.copy(scene.bound.getMin());
        max.copy(scene.bound.getMax());
    };

    events.on('scene.boundChanged', () => {
        if (!customized) {
            fitToBound();
        }
        // keep faces within the (possibly grown) bound and refresh UI ranges
        changed();
    });

    events.function('section.state', () => state());

    events.on('section.setEnabled', (value: boolean) => {
        if (value !== enabled) {
            enabled = value;
            if (enabled && !customized) {
                fitToBound();
            }
            changed();
        }
    });

    events.on('section.toggle', () => {
        events.fire('section.setEnabled', !enabled);
    });

    // move a single face; clamps so min never crosses max on the same axis
    events.on('section.setBound', (axis: Axis, side: 'min' | 'max', value: number) => {
        if (side === 'min') {
            min[axis] = Math.min(value, max[axis]);
        } else {
            max[axis] = Math.max(value, min[axis]);
        }
        customized = true;
        changed();
    });

    // restore the box to the full scene bound
    events.on('section.reset', () => {
        fitToBound();
        customized = false;
        changed();
    });

    // draw the section box wireframe each frame while enabled
    events.on('prerender', () => {
        applyUniforms();
        if (enabled) {
            scene.app.drawWireAlignedBox(min, max, boxColor);
        }
    });

    // initialize shader uniforms (disabled) on startup
    applyUniforms();
};

export { registerCrossSectionEvents, SectionState };
