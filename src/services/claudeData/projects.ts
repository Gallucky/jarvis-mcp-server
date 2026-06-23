import { getData } from "./cache.js";
import type { ParsedCodeSession } from "./codeSessions.js";
import { newTokensOf } from "./helpers.js";

export function getProjects() {
    const { codeSessions } = getData();
    const byProject = new Map<string, ParsedCodeSession[]>();
    for (const s of codeSessions) {
        const arr = byProject.get(s.projectId) ?? [];
        arr.push(s);
        byProject.set(s.projectId, arr);
    }

    return Array.from(byProject.entries()).map(([id, sessions]) => {
        const totalTokens = sessions.reduce((sum, s) => sum + newTokensOf(s), 0);
        const totalMessages = sessions.reduce((sum, s) => sum + s.userMessageCount + s.assistantMessageCount, 0);
        const estimatedCostUSD = sessions.reduce((sum, s) => sum + s.costUSD, 0);
        const lastActive = sessions.reduce<string | null>((latest, s) => (!latest || (s.lastTs && s.lastTs > latest) ? s.lastTs : latest), null);
        const models = Array.from(new Set(sessions.flatMap((s) => s.models)));
        return {
            id,
            name: sessions[0].projectName,
            path: sessions[0].projectPath,
            sessions: sessions.length,
            totalTokens,
            totalMessages,
            estimatedCostUSD,
            lastActive,
            models,
        };
    }).sort((a, b) => ((a.lastActive ?? "") < (b.lastActive ?? "") ? 1 : -1));
}
