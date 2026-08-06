const MACHINE_KEYS = new Set([
    'eva15',
    'eva17',
    'garo',
    'garo12',
    'ghoul',
    'oumi5',
    'hokuto4',
    'rezero2',
    'shigotonin6'
]);
const SPIN_OPTIONS = new Set([500, 1000, 2000, 3000]);
const RANKING_CATEGORIES = new Set(['balls', 'drought']);
const MIN_ROTATION = 16;
const MAX_ROTATION = 20;
const MAX_BALLS = 1_000_000;
const MAX_DROUGHT = 3_000;
const MAX_BODY_BYTES = 4_096;
const RUN_TTL_SECONDS = 30 * 60;
const MIN_RUN_SECONDS = 2;
const START_WINDOW_SECONDS = 10 * 60;
const START_LIMIT = 10;
const SUBMIT_WINDOW_SECONDS = 60 * 60;
const SUBMIT_LIMIT = 10;

class ApiError extends Error {
    constructor(status, message, retryAfter = null) {
        super(message);
        this.status = status;
        this.retryAfter = retryAfter;
    }
}

function jsonResponse(payload, status = 200, retryAfter = null) {
    const headers = new Headers({
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin'
    });
    if (retryAfter !== null) {
        headers.set('Retry-After', String(retryAfter));
    }
    return new Response(JSON.stringify(payload), { status, headers });
}

function assertMachineKey(value) {
    if (typeof value !== 'string' || !MACHINE_KEYS.has(value)) {
        throw new ApiError(400, '機種が正しくありません。');
    }
    return value;
}

function assertCategory(value) {
    const category = value || 'balls';
    if (typeof category !== 'string' || !RANKING_CATEGORIES.has(category)) {
        throw new ApiError(400, 'ランキング種別が正しくありません。');
    }
    return category;
}

function assertInteger(value, message) {
    if (!Number.isInteger(value)) {
        throw new ApiError(400, message);
    }
    return value;
}

function normalizeNickname(value) {
    if (typeof value !== 'string') {
        throw new ApiError(400, 'ニックネームを入力してください。');
    }
    const nickname = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
    const length = Array.from(nickname).length;
    const hasControlCharacters = /[\u0000-\u001f\u007f-\u009f]/u.test(nickname);
    const hasInvisibleFormatting = /[\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/u.test(nickname);
    if (length < 1 || length > 12 || hasControlCharacters || hasInvisibleFormatting) {
        throw new ApiError(400, 'ニックネームは1〜12文字で入力してください。');
    }
    return nickname;
}

function assertSameOrigin(request) {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== new URL(request.url).origin) {
        throw new ApiError(403, 'このページから送信してください。');
    }
}

async function readJsonBody(request) {
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.toLowerCase().startsWith('application/json')) {
        throw new ApiError(415, 'JSON形式で送信してください。');
    }

    const declaredLength = Number(request.headers.get('Content-Length') || 0);
    if (declaredLength > MAX_BODY_BYTES) {
        throw new ApiError(413, '送信内容が大きすぎます。');
    }

    const bodyText = await request.text();
    if (new TextEncoder().encode(bodyText).byteLength > MAX_BODY_BYTES) {
        throw new ApiError(413, '送信内容が大きすぎます。');
    }

    try {
        const body = JSON.parse(bodyText);
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            throw new Error('invalid payload');
        }
        return body;
    } catch {
        throw new ApiError(400, '送信内容を確認してください。');
    }
}

async function getIpHash(request, env) {
    if (!env.LEADERBOARD_HASH_SALT) {
        throw new ApiError(503, 'ランキングを一時的に利用できません。');
    }
    const forwarded = request.headers.get('X-Forwarded-For');
    const ip = request.headers.get('CF-Connecting-IP')
        || (forwarded ? forwarded.split(',')[0].trim() : '')
        || 'local';
    const bytes = new TextEncoder().encode(`${env.LEADERBOARD_HASH_SALT}:${ip}`);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function getScoreColumn(category) {
    return assertCategory(category) === 'drought' ? 'max_drought' : 'balls';
}

async function getLeaderboard(db, machineKey, category) {
    const scoreColumn = getScoreColumn(category);
    const scoreFilter = category === 'drought' ? ' AND max_drought > 0' : '';
    const result = await db.prepare(`
        WITH personal_best AS (
            SELECT
                id,
                nickname,
                balls,
                max_drought,
                spins,
                rotation_1k,
                created_at,
                ROW_NUMBER() OVER (
                    PARTITION BY ip_hash
                    ORDER BY ${scoreColumn} DESC, created_at ASC, id ASC
                ) AS personal_rank
            FROM leaderboard_entries
            WHERE machine_key = ?${scoreFilter}
        )
        SELECT id, nickname, balls, max_drought, spins, rotation_1k, created_at
        FROM personal_best
        WHERE personal_rank = 1
        ORDER BY ${scoreColumn} DESC, created_at ASC, id ASC
        LIMIT 10
    `).bind(machineKey).all();

    return (result.results || []).map((entry, index) => ({
        rank: index + 1,
        nickname: entry.nickname,
        balls: entry.balls,
        maxDrought: entry.max_drought,
        spins: entry.spins,
        rotation1k: entry.rotation_1k,
        createdAt: new Date(entry.created_at * 1000).toISOString()
    }));
}

async function getEntryRank(db, machineKey, entryId, category) {
    const scoreColumn = getScoreColumn(category);
    const scoreFilter = category === 'drought' ? ' AND max_drought > 0' : '';
    const result = await db.prepare(`
        WITH personal_best AS (
            SELECT
                id,
                balls,
                max_drought,
                created_at,
                ROW_NUMBER() OVER (
                    PARTITION BY ip_hash
                    ORDER BY ${scoreColumn} DESC, created_at ASC, id ASC
                ) AS personal_rank
            FROM leaderboard_entries
            WHERE machine_key = ?${scoreFilter}
        ),
        ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    ORDER BY ${scoreColumn} DESC, created_at ASC, id ASC
                ) AS global_rank
            FROM personal_best
            WHERE personal_rank = 1
        )
        SELECT global_rank
        FROM ranked
        WHERE id = ?
    `).bind(machineKey, entryId).first();
    return result ? result.global_rank : null;
}

async function startRun(request, env, body) {
    const machineKey = assertMachineKey(body.machine);
    const spins = assertInteger(body.spins, '回転数が正しくありません。');
    const rotation1k = assertInteger(body.rotation1k, '千円あたり回転数が正しくありません。');
    if (!SPIN_OPTIONS.has(spins) || rotation1k < MIN_ROTATION || rotation1k > MAX_ROTATION) {
        throw new ApiError(400, '実行条件が正しくありません。');
    }

    const ipHash = await getIpHash(request, env);
    const now = Math.floor(Date.now() / 1000);
    const recent = await env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM leaderboard_runs
        WHERE ip_hash = ? AND started_at >= ?
    `).bind(ipHash, now - START_WINDOW_SECONDS).first();
    if ((recent?.count || 0) >= START_LIMIT) {
        throw new ApiError(429, '実行回数が多すぎます。少し待ってから試してください。', START_WINDOW_SECONDS);
    }

    await env.DB.prepare(`
        DELETE FROM leaderboard_runs
        WHERE used_at IS NULL AND expires_at < ?
    `).bind(now - 86_400).run();

    const runId = crypto.randomUUID();
    const expiresAt = now + RUN_TTL_SECONDS;
    await env.DB.prepare(`
        INSERT INTO leaderboard_runs (
            id, ip_hash, machine_key, spins, rotation_1k, started_at, expires_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(runId, ipHash, machineKey, spins, rotation1k, now, expiresAt).run();

    return jsonResponse({
        ok: true,
        runId,
        expiresAt: new Date(expiresAt * 1000).toISOString()
    }, 201);
}

async function submitScore(request, env, body) {
    const runId = typeof body.runId === 'string' ? body.runId : '';
    if (!/^[0-9a-f-]{36}$/i.test(runId)) {
        throw new ApiError(400, '実行情報が正しくありません。');
    }
    const nickname = normalizeNickname(body.nickname);
    const balls = assertInteger(body.balls, '出玉が正しくありません。');
    const maxDrought = body.maxDrought === undefined
        ? 0
        : assertInteger(body.maxDrought, '最大ハマり回転数が正しくありません。');
    const category = assertCategory(body.category);
    if (balls < 0 || balls > MAX_BALLS) {
        throw new ApiError(400, '出玉が登録可能な範囲を超えています。');
    }
    if (maxDrought < 0 || maxDrought > MAX_DROUGHT) {
        throw new ApiError(400, '最大ハマり回転数が登録可能な範囲を超えています。');
    }

    const ipHash = await getIpHash(request, env);
    const now = Math.floor(Date.now() / 1000);
    const recent = await env.DB.prepare(`
        SELECT COUNT(*) AS count
        FROM leaderboard_entries
        WHERE ip_hash = ? AND created_at >= ?
    `).bind(ipHash, now - SUBMIT_WINDOW_SECONDS).first();
    if ((recent?.count || 0) >= SUBMIT_LIMIT) {
        throw new ApiError(429, '登録回数が多すぎます。時間をおいて試してください。', SUBMIT_WINDOW_SECONDS);
    }

    const run = await env.DB.prepare(`
        SELECT id, ip_hash, machine_key, spins, rotation_1k, started_at, expires_at, used_at
        FROM leaderboard_runs
        WHERE id = ?
    `).bind(runId).first();
    if (!run || run.ip_hash !== ipHash) {
        throw new ApiError(404, 'この実行結果は登録できません。');
    }
    if (run.used_at !== null || run.expires_at < now) {
        throw new ApiError(409, 'この実行結果は登録済みか、有効期限が切れています。');
    }
    if (now - run.started_at < MIN_RUN_SECONDS) {
        throw new ApiError(409, 'シミュレーション完了後に登録してください。');
    }
    if (maxDrought > run.spins) {
        throw new ApiError(400, '最大ハマり回転数が実行条件を超えています。');
    }

    const entryId = crypto.randomUUID();
    try {
        const results = await env.DB.batch([
            env.DB.prepare(`
                UPDATE leaderboard_runs
                SET used_at = ?
                WHERE id = ? AND ip_hash = ? AND used_at IS NULL AND expires_at >= ?
            `).bind(now, runId, ipHash, now),
            env.DB.prepare(`
                INSERT INTO leaderboard_entries (
                    id, run_id, nickname, machine_key, balls, max_drought, spins,
                    rotation_1k, ip_hash, created_at
                )
                SELECT ?, id, ?, machine_key, ?, ?, spins, rotation_1k, ip_hash, ?
                FROM leaderboard_runs
                WHERE id = ? AND ip_hash = ? AND used_at = ?
            `).bind(entryId, nickname, balls, maxDrought, now, runId, ipHash, now)
        ]);
        const inserted = results[1]?.meta?.changes ?? results[1]?.meta?.rows_written ?? 0;
        if (inserted !== 1) {
            throw new ApiError(409, 'この実行結果は登録済みか、有効期限が切れています。');
        }
    } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(409, 'この実行結果はすでに登録されています。');
    }

    const [entries, ballsRank, droughtRank] = await Promise.all([
        getLeaderboard(env.DB, run.machine_key, category),
        getEntryRank(env.DB, run.machine_key, entryId, 'balls'),
        getEntryRank(env.DB, run.machine_key, entryId, 'drought')
    ]);
    const ranks = { balls: ballsRank, drought: droughtRank };
    return jsonResponse({
        ok: true,
        machine: run.machine_key,
        category,
        rank: ranks[category],
        ranks,
        personalBest: ranks[category] !== null,
        entries
    }, 201);
}

async function handleRequest(context) {
    try {
        if (!context.env.DB) {
            throw new ApiError(503, 'ランキングを一時的に利用できません。');
        }

        if (context.request.method === 'GET') {
            const url = new URL(context.request.url);
            const machineKey = assertMachineKey(url.searchParams.get('machine'));
            const category = assertCategory(url.searchParams.get('category'));
            const entries = await getLeaderboard(context.env.DB, machineKey, category);
            return jsonResponse({ ok: true, machine: machineKey, category, entries });
        }

        assertSameOrigin(context.request);
        const body = await readJsonBody(context.request);
        if (body.action === 'start') {
            return await startRun(context.request, context.env, body);
        }
        if (body.action === 'submit') {
            return await submitScore(context.request, context.env, body);
        }
        throw new ApiError(400, '操作が正しくありません。');
    } catch (error) {
        if (error instanceof ApiError) {
            return jsonResponse({ ok: false, error: error.message }, error.status, error.retryAfter);
        }
        console.error('Leaderboard request failed');
        return jsonResponse({ ok: false, error: 'ランキングを一時的に利用できません。' }, 500);
    }
}

export const onRequestGet = handleRequest;
export const onRequestPost = handleRequest;
