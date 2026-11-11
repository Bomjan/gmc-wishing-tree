/** Shared menu metadata. */
export const experiences = [
  {
    id: "wishing-tree",
    path: "/wishing-tree",
    title: "Wishing Tree",
    description: "Leave a wish. Watch it grow.",
    status: "implemented",
  },
  {
    id: "signature-wall",
    path: "/signature-wall",
    title: "Wall of Signatures",
    description: "Sign, doodle and choose your spot.",
    status: "implemented",
  },
] as const;

export type ExperienceId = (typeof experiences)[number]["id"];
