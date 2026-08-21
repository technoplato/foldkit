/** iPhone 17 Pro design contract. Metres. Screen faces +Z. */

/** Body height. */
export const phoneHeight = 0.15
/** Body width. */
export const phoneWidth = 0.0719
/** Body thickness. */
export const phoneDepth = 0.00875
/** Corner radius of the unibody. */
export const phoneCornerRadius = 0.0118
/** Super Retina XDR diagonal in metres (6.3 in). */
export const displayDiagonal = 0.16
/** Active OLED width. */
export const displayWidth = 0.0666
/** Active OLED height. */
export const displayHeight = 0.1448
/** Front-glass inset from the aluminum edge. */
export const displayInset = (phoneWidth - displayWidth) / 2
/** Dynamic Island width. */
export const islandWidth = 0.032
/** Dynamic Island height. */
export const islandHeight = 0.0074
/** Dynamic Island center Y from phone center. */
export const islandCenterY = phoneHeight / 2 - 0.0086
/** Camera plateau width. */
export const plateauWidth = 0.0664
/** Camera plateau height. */
export const plateauHeight = 0.042
/** Camera plateau extra thickness. */
export const plateauDepth = 0.0074
/** Camera plateau center Y from phone center. */
export const plateauCenterY = phoneHeight / 2 - plateauHeight / 2 - 0.0032
/** Individual camera lens barrel radius. */
export const lensRadius = 0.0064
/** Lens glass radius. */
export const lensGlassRadius = 0.0048
/** Action-button length. */
export const actionButtonLength = 0.012
/** Volume-button length. */
export const volumeButtonLength = 0.018
/** Side-button protrusion. */
export const buttonProtrusion = 0.0009
/** Cosmic Orange anodized aluminum. */
export const cosmicOrange = 0xe24c1b
/** Black Ceramic Shield front. */
export const ceramicShield = 0x101214
/** OLED screen canvas width in pixels. */
export const screenTextureWidth = 603
/** OLED screen canvas height in pixels. */
export const screenTextureHeight = 1311
/** Seeded assembly id. Matches the clip SKU. */
export const phoneSeed = 1428
/** Phone-hero camera distance as a multiple of phone height. */
export const phoneHeroDistanceScale = 2.42
/** Phone-hero vertical field of view in degrees. */
export const phoneHeroFov = 28
/** Presentation lift duration in seconds. */
export const phonePresentSeconds = 1.15

/** Authored phone-hero camera distance. */
export const phoneHeroDistance = phoneHeight * phoneHeroDistanceScale
