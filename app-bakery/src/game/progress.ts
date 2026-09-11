import { CHAPTERS, chapterRecipes, type Chapter, type Recipe } from "./curriculum";
import type { Mastery } from "./mastery";
import { store } from "./store";

/**
 * Where the child is in the story, and where they go next.
 *
 * This module exists because the game shipped without it. `chapter` was written once during
 * onboarding and never touched again, so a child who finished all six recipes in The Little
 * Kitchen was returned to The Little Kitchen, for ever. Four of the five chapters — 314 of the
 * game's 356 facts — could not be reached by playing. The game had no ending, and more
 * importantly it had no *middle*.
 *
 * Progression is derived from mastery rather than stored as a pointer wherever possible: a chapter
 * is finished when its recipes are finished, which is a fact about the save, not a flag that can
 * drift out of step with it. `chapter` is now only ever "the room the child is standing in".
 */

export function chapterIsComplete(chapter: Chapter, mastery: Mastery): boolean {
  return chapterRecipes(chapter).every((r) => mastery.progress(r).complete);
}

export function chapterProgress(
  chapter: Chapter,
  mastery: Mastery
): { baked: number; total: number; complete: boolean } {
  const recipes = chapterRecipes(chapter);
  let baked = 0;
  let total = 0;
  for (const r of recipes) {
    const p = mastery.progress(r);
    baked += p.baked;
    total += p.total;
  }
  return { baked, total, complete: baked === total && total > 0 };
}

/**
 * The next chapter worth opening, or null when every chapter is finished.
 *
 * Looks forward from the current room first, then wraps to the start — a nine-year-old who began
 * at The Morning Market and finished the last chapter should be offered The Little Kitchen rather
 * than being told the game is over while two thirds of it is untouched.
 */
export function nextChapterIndex(from: number, mastery: Mastery): number | null {
  for (let i = from; i < CHAPTERS.length; i++) {
    if (!chapterIsComplete(CHAPTERS[i], mastery)) return i;
  }
  for (let i = 0; i < from; i++) {
    if (!chapterIsComplete(CHAPTERS[i], mastery)) return i;
  }
  return null;
}

export function gameIsComplete(mastery: Mastery): boolean {
  return CHAPTERS.every((c) => chapterIsComplete(c, mastery));
}

/** Chapters the child is allowed to walk into: everything up to the high-water mark. */
export function unlockedChapters(): Chapter[] {
  const top = Math.max(store.state.unlockedChapter, store.state.chapter);
  return CHAPTERS.filter((c) => c.index <= top);
}

/** Move the child into a chapter, raising the high-water mark if this is new ground. */
export function enterChapter(index: number): void {
  const clamped = Math.max(0, Math.min(CHAPTERS.length - 1, index));
  store.update({
    chapter: clamped,
    unlockedChapter: Math.max(store.state.unlockedChapter, clamped),
  });
}

/** The recipe the board should offer next inside one chapter. */
export function nextRecipeIn(chapter: Chapter, mastery: Mastery): Recipe | null {
  const list = chapterRecipes(chapter);
  return list.find((r) => !mastery.progress(r).complete) ?? null;
}

/**
 * The one recipe to put on a single button.
 *
 * Priority:
 *  1. a shelf the child has genuinely been away from (review is what builds fluency)
 *  2. the next unfinished recipe (new material)
 *  3. once everything in the room is finished, whatever has been left longest
 *
 * Rule 3 is not a detail. Without it, a child who finished the game was handed the *same* recipe
 * for ever — an automated completion run played the last eighty of its lessons on The Big Party
 * Cake, because the board's fallback was "the last node on the list". Finishing a game should not
 * turn it into a loop of one screen.
 */
export function recommendedRecipe(chapter: Chapter, mastery: Mastery): Recipe | null {
  const list = chapterRecipes(chapter);
  const restock = list.find((r) => {
    const p = mastery.progress(r);
    return p.complete && !p.allSpecial && p.due > 0;
  });
  return restock ?? nextRecipeIn(chapter, mastery) ?? leastRecent(list, mastery);
}

/**
 * The shelf left alone the longest — the bakery's maintenance list.
 *
 * Ranked by how many treats are actually going stale first, then by how long ago the child last
 * touched the recipe at all, so a finished chapter rotates instead of repeating.
 */
export function leastRecent(list: Recipe[], mastery: Mastery): Recipe | null {
  if (list.length === 0) return null;
  return list
    .slice()
    .sort((a, b) => {
      const pa = mastery.progress(a);
      const pb = mastery.progress(b);
      if (pb.due !== pa.due) return pb.due - pa.due;
      if (pb.stale !== pa.stale) return pb.stale - pa.stale;
      return mastery.lastSeenIn(a) - mastery.lastSeenIn(b);
    })[0];
}
