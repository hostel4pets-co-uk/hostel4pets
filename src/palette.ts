export const dotColours = Object.freeze({
  RED: "red",
  GREEN: "green",
  DARK_BLUE: "#00008b",
  YELLOW: "#d4a017",
  PURPLE: "purple",
  ORANGE: "orange",
  HOT_PINK: "#ff69b4",
  MAROON: "maroon",
  GOLD: "gold",
  DARK_GREEN: "#006400",
  MAGENTA: "magenta",
  NAVY: "navy",
  BROWN: "#8b4513",
  INDIGO: "indigo",
  OLIVE: "olive",
  CRIMSON: "crimson",
  AQUAMARINE: "#7fffd4",
  DARK_ORANGE: "#ff8c00",
  CORAL: "coral",
  GREY: "grey"
});

export const backgroundColours = Object.freeze({
  SELECTED: "#AADBAC",
  PAST: "#d3d3d3",
  TODAY: "#add8e6",
  BUSY: "#ffebcd",
  BOOKED: "#ffc0cb",
  BANKHOLIDAY: "#e6ccff",
  NOTAVAILABLE: "#a9a9a9"
});

export type DotColour = typeof dotColours[keyof typeof dotColours];
