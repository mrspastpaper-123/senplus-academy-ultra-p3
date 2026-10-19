/**
 * Remove known generated-bank labels for display only.
 * Never apply this to stored questions, option IDs, submitted answers or chart matching.
 */
export function cleanLearningText(value: string): string {
  return value
    .replace(/^[ \t]*【[1-6][A-Z]{1,4}[0-9]+(?:[-.][0-9]+)?(?:[｜|][^】]*)?】[ \t]*/gmu, "")
    .replace(/[ \t]*[（(][ \t]*(?:題組[ \t]*[0-9]+|set[ \t]+[0-9]+[a-z]?(?:[.-][0-9a-z]+)*)[ \t]*[）)]/gi, "")
    .trim();
}
