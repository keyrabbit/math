import type { GradeBand, Profile } from "./types";

const STORAGE_KEY = "number-nest.profile.v1";
const FREE_LESSONS_PER_DAY = 3; // honest, generous free tier -- see RESEARCH.md #4 on avoiding aggressive paywalls

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadProfile(): Profile | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Profile;
    if (parsed.lastLessonDay !== todayKey()) {
      parsed.lessonsToday = 0;
      parsed.lastLessonDay = todayKey();
    }
    return parsed;
  } catch {
    return null;
  }
}

export function createProfile(name: string, gradeBand: GradeBand, mascotColor: string, mascotAccessory: string): Profile {
  return {
    name,
    gradeBand,
    mascotColor,
    mascotAccessory,
    stars: 0,
    lessonsToday: 0,
    lastLessonDay: todayKey(),
    skills: {},
  };
}

export function saveProfile(profile: Profile): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export function clearProfile(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasFreeLessonRemaining(profile: Profile): boolean {
  return profile.lessonsToday < FREE_LESSONS_PER_DAY;
}

export function remainingFreeLessons(profile: Profile): number {
  return Math.max(0, FREE_LESSONS_PER_DAY - profile.lessonsToday);
}

export const FREE_LESSON_CAP = FREE_LESSONS_PER_DAY;
