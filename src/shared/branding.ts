/** GMCX kiosk brand tokens, from the GMC Experience Centre kiosk brand guide.
 * Hex values are the guide's visual estimates; PT Serif and Roboto stand in
 * for the unverified website fonts. Mirrored as CSS custom properties in
 * `src/shared/kiosk/brand.css`. */
export const gmcxBrand = {
  source: "GMCX kiosk brand guide",
  /** Main action buttons and small highlights. */
  actionGold: "#FFD66B",
  /** Prototype feedback while a primary button is pressed. */
  actionPressed: "#E6B947",
  /** Button labels, dark panels and overlays. */
  actionInk: "#171717",
  ink: "#171717",
  /** Light backgrounds and the logo header. */
  surface: "#F3F1EE",
  white: "#FFFFFF",
  /** Links, active tabs and focus outlines on light surfaces. */
  blue: "#17658D",
  displayFont: "PT Serif",
  bodyFont: "Roboto",
} as const;
