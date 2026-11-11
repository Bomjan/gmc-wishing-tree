# GMCX kiosk visual direction

Source: the GMC Experience Centre kiosk brand guide (November 2026). Its hex values are visual estimates of the Centre's website; PT Serif and Roboto are the suggested substitutes for the unverified website fonts. The logo in `src/shared/kiosk/KioskHeader.tsx` is a coded stand-in (black geometric square and stacked wordmark); replace it with the Centre's original artwork when supplied.

## Tokens

| Token | Hex | Use |
| --- | --- | --- |
| Warm yellow | `#FFD66B` | Primary buttons, small highlights, the visitor's leaf |
| Pressed yellow | `#E6B947` | Primary button while pressed |
| Near black | `#171717` | Button labels, dark panels and overlays |
| Warm off-white | `#F3F1EE` | Header and light backgrounds |
| White | `#FFFFFF` | Text and secondary outlines on dark panels |
| Blue | `#17658D` | Focus outlines and links on light surfaces |

Defined once in `src/shared/branding.ts` and as CSS custom properties in `src/shared/kiosk/brand.css`.

## Type and spacing

The stage is 1080 × 1920 design units (1 rem = 16 units) and scales 2× on the 2160 × 3840 panel, so the guide's pixel sizes are used directly: idle headline PT Serif Bold 72/78, screen title 48/56, panel title 32/40, body Roboto 24/34, button labels Roboto Bold 22/28, progress 18/24. Touch targets are 72 × 72 (56 minimum). Headings are uppercase.

## Screens

- **Attract (`/`)**: full-screen Centre imagery (`public/kiosk/gmc-city-aerial.jpg`, from the GMC brief), a dark panel with the idle headline and one primary action, Get started.
- **Choose (`/choose`)**: the two-choice menu, each experience as one large dark card.
- **Wishing Tree and Wall of Signatures**: the shared header (logo, Back to the menu, Home, screen title), the live tree or wall, and the same dark right-edge action rail at the visitor-adjustable reach height. Forms open as dark sheets with a yellow top rule. After a contribution, its leaf or signature is highlighted and the Undo countdown is shown; wish text stays private.

Buttons are rectangular. Primary: yellow fill, near-black label, one per view. Secondary: transparent with a 2 px outline, white on dark surfaces and near black on light ones.
