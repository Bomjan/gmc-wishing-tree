/** Menu metadata for the next routing implementation. Not mounted yet. */
export const handprintWallTitle =
  import.meta.env.VITE_HANDPRINT_WALL_TITLE?.trim() || "Wall of Us";

export const experiences = [
  {
    id: "wishing-tree",
    path: "/wishing-tree",
    title: "Wishing Tree",
    description: "Leave a wish. Watch it grow.",
    status: "implemented",
  },
  {
    id: "handprint-wall",
    path: "/handprint-wall",
    title: handprintWallTitle,
    description: "Leave your mark.",
    status: "planned",
  },
] as const;

export type ExperienceId = (typeof experiences)[number]["id"];
