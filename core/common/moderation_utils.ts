export type ModerationScoreItem = {
    userId: string;
    score: number;
};

const MINUTE_IN_MS = 60 * 1000;
const HOUR_IN_MS = 60 * MINUTE_IN_MS;
const DAY_IN_MS = 24 * HOUR_IN_MS;
const MAX_SCORE = 10080;

export function computeTimeoutDurationFromScore(score: number): number {
    const normalizedScore = Math.max(1, Math.min(MAX_SCORE, Math.abs(Math.trunc(score))));
    return normalizedScore * MINUTE_IN_MS;
}

export function selectMaxScorePerUser<T extends ModerationScoreItem>(items: T[]): Map<string, T> {
    const bestByUser = new Map<string, T>();

    for (const item of items) {
        const current = bestByUser.get(item.userId);
        if (!current || item.score > current.score) {
            bestByUser.set(item.userId, item);
        }
    }

    return bestByUser;
}

export function formatTimeoutDuration(durationMs: number): string {
    if (durationMs >= DAY_IN_MS) {
        const days = Math.max(1, Math.round(durationMs / DAY_IN_MS));
        return `${days} day${days === 1 ? '' : 's'}`;
    }
    if (durationMs >= HOUR_IN_MS) {
        const hours = Math.max(1, Math.round(durationMs / HOUR_IN_MS));
        return `${hours} hour${hours === 1 ? '' : 's'}`;
    }
    const minutes = Math.max(1, Math.round(durationMs / MINUTE_IN_MS));
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}
