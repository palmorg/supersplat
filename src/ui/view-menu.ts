import { Button, Container } from '@playcanvas/pcui';

import { Events } from '../events';
import { i18n } from './localization';
import viewBackSvg from './svg/view-back.svg';
import viewBottomSvg from './svg/view-bottom.svg';
import viewFrontSvg from './svg/view-front.svg';
import viewIsoSvg from './svg/view-iso.svg';
import viewLeftSvg from './svg/view-left.svg';
import viewRightSvg from './svg/view-right.svg';
import viewTopSvg from './svg/view-top.svg';
import { Tooltips } from './tooltips';

const createSvg = (svgString: string) => {
    const decodedStr = decodeURIComponent(svgString.substring('data:image/svg+xml,'.length));
    return new DOMParser().parseFromString(decodedStr, 'image/svg+xml').documentElement;
};

// A small flyout, opened from the right-toolbar cube button, that lets the user
// snap the camera to a standard orientation. Each option is a cube icon with the
// matching face highlighted; they are laid out spatially (top above front, bottom
// below, left/front/right/back across the middle row) to mirror a SolidWorks-style
// view-orientation selector, with isometric below.
class ViewMenu extends Container {
    constructor(events: Events, tooltips: Tooltips, args = {}) {
        args = {
            ...args,
            id: 'view-menu',
            class: 'panel',
            hidden: true
        };

        super(args);

        // stop pointer events reaching the camera controller behind the flyout
        ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick'].forEach((eventName) => {
            this.dom.addEventListener(eventName, (event: Event) => event.stopPropagation());
        });

        const grid = new Container({ id: 'view-menu-grid' });

        // buttons keyed by the view id returned by 'camera.alignedView'
        const buttons = new Map<string, Button>();

        // axis codes map to the cases handled by the 'camera.align' event
        const makeButton = (svg: string, labelKey: string, axis: string, viewId: string) => {
            const button = new Button({ class: ['view-menu-button', `view-menu-${viewId}`] });
            button.dom.appendChild(createSvg(svg));
            tooltips.register(button, () => i18n.t(labelKey), 'top');
            button.on('click', () => {
                events.fire('camera.align', axis);
                events.fire('viewMenu.setVisible', false);
            });
            grid.append(button);
            buttons.set(viewId, button);
        };

        makeButton(viewTopSvg, 'view-menu.top', 'py', 'top');
        makeButton(viewLeftSvg, 'view-menu.left', 'nx', 'left');
        makeButton(viewFrontSvg, 'view-menu.front', 'pz', 'front');
        makeButton(viewRightSvg, 'view-menu.right', 'px', 'right');
        makeButton(viewBackSvg, 'view-menu.back', 'nz', 'back');
        makeButton(viewBottomSvg, 'view-menu.bottom', 'ny', 'bottom');
        makeButton(viewIsoSvg, 'view-menu.isometric', 'iso', 'iso');

        this.append(grid);

        // visibility handling (mirrors ColorPanel)
        const setVisible = (visible: boolean) => {
            if (visible === this.hidden) {
                this.hidden = !visible;
                events.fire('viewMenu.visible', visible);
            }
        };

        events.function('viewMenu.visible', () => !this.hidden);
        events.on('viewMenu.setVisible', (visible: boolean) => setVisible(visible));
        events.on('viewMenu.toggleVisible', () => setVisible(this.hidden));

        // on open: anchor next to the toolbar button, close sibling panels, and
        // highlight the button matching the camera's current orientation
        events.on('viewMenu.visible', (visible: boolean) => {
            if (visible) {
                events.fire('colorPanel.setVisible', false);
                const button = document.getElementById('right-toolbar-isometric-view');
                if (button) {
                    const rect = button.getBoundingClientRect();
                    this.dom.style.top = `${rect.top + rect.height / 2}px`;
                    this.dom.style.right = `${window.innerWidth - rect.left + 8}px`;
                }
                const active = events.invoke('camera.alignedView');
                buttons.forEach((btn, id) => btn.class[id === active ? 'add' : 'remove']('active'));
            }
        });

        // close when the user starts interacting with the 3d view, or another panel opens
        events.on('camera.controller', (name: string) => {
            if (!this.hidden && (name === 'pointerdown' || name === 'wheel' || name === 'dblclick')) {
                setVisible(false);
            }
        });
        events.on('colorPanel.visible', (v: boolean) => v && setVisible(false));
        events.on('viewPanel.visible', (v: boolean) => v && setVisible(false));
    }
}

export { ViewMenu };
