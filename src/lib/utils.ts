import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/*
 * tailwind-merge must know the custom font sizes (tailwind.config.ts), or it
 * reads `text-nv-label` as a text colour and drops a real colour such as
 * `text-white` from the same element.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        { text: ["nv-hero", "nv-display", "nv-figure", "nv-statement", "nv-title", "nv-lead", "nv-contact", "nv-quote", "nv-intro", "nv-body", "nv-label", "nv-small", "nv-wordmark", "nv-wordmark-lg"] },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
