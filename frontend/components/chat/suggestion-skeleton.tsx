"use client";

import { motion } from "motion/react";

const PILLS = ["7rem", "9rem", "6rem"];

export function SuggestionSkeleton() {
  return (
    <motion.div
      aria-hidden
      className="flex flex-wrap justify-center gap-2"
      initial="hidden"
      animate="show"
      variants={{
        show: { transition: { staggerChildren: 0.12 } },
      }}
    >
      {PILLS.map((width, index) => (
        <motion.span
          key={index}
          style={{ width }}
          className="suggestion-shimmer h-8 rounded-full"
          variants={{
            hidden: { opacity: 0, y: 6, scale: 0.96 },
            show: {
              opacity: 1,
              y: 0,
              scale: 1,
              transition: { type: "spring", stiffness: 500, damping: 30 },
            },
          }}
        />
      ))}
    </motion.div>
  );
}
