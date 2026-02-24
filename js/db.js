// ─── db.js — All Supabase calls ───────────────────────────────────────────────

const client = supabase.createClient(SB_URL, SB_KEY);
export { client };

export const db = {

    // ── Litanies ──────────────────────────────────────────────────────────────

    async getLitanies() {
        const { data, error } = await client
            .from('litanies')
            .select('id, name, description, litany_structure(count)')
            .eq('is_preset', false)
            .order('name');
        if (error) throw error;
        return data || [];
    },

    async createLitany(name, desc, schedule) {
        const { data, error } = await client
            .from('litanies')
            .insert({ name, description: desc || null, is_preset: false, schedule: schedule || null })
            .select().single();
        if (error) throw error;
        return data;
    },

    async updateLitanySchedule(litanyId, schedule) {
        await client.from('litanies').update({ schedule: schedule || null }).eq('id', litanyId);
    },

    async deleteLitany(id) {
        await client.from('litany_schedules').delete().eq('litany_id', id);
        await client.from('litany_sessions').delete().eq('litany_id', id);
        await client.from('litany_structure').delete().eq('litany_id', id);
        const { error } = await client.from('litanies').delete().eq('id', id);
        if (error) throw error;
    },

    // ── Explore ───────────────────────────────────────────────────────────────

    async getPresets() {
        const { data, error } = await client
            .from('litanies')
            .select('id, name, description, litany_structure(count)')
            .eq('is_preset', true)
            .order('name');
        if (error) throw error;
        return data || [];
    },

    async getAllBlocks() {
        const { data, error } = await client
            .from('adhkar_blocks')
            .select('*')
            .order('category')
            .order('title');
        if (error) throw error;
        return data || [];
    },

    // ── Structure ─────────────────────────────────────────────────────────────

    async getBlocksForLitany(litanyId) {
        const { data, error } = await client
            .from('litany_structure')
            .select('id, user_count, order_index, adhkar_blocks(*)')
            .eq('litany_id', litanyId)
            .order('order_index', { nullsFirst: false });
        if (error) throw error;
        return data || [];
    },

    async addBlockToLitany(litanyId, blockId, count) {
        const { data: existing } = await client
            .from('litany_structure')
            .select('order_index')
            .eq('litany_id', litanyId)
            .order('order_index', { ascending: false })
            .limit(1);
        const nextIdx = existing?.length && existing[0].order_index != null
            ? existing[0].order_index + 1 : 1;
        const { error } = await client.from('litany_structure').insert({
            litany_id: litanyId, block_id: blockId,
            order_index: nextIdx, user_count: count
        });
        if (error) throw error;
    },

    async removeBlockFromLitany(structureId) {
        const { error } = await client
            .from('litany_structure').delete().eq('id', structureId);
        if (error) throw error;
    },

    async clonePreset(presetId, name) {
        const { data: newLit, error: litErr } = await client
            .from('litanies')
            .insert({ name, is_preset: false })
            .select().single();
        if (litErr) throw litErr;

        const { data: structure } = await client
            .from('litany_structure')
            .select('block_id, order_index, user_count')
            .eq('litany_id', presetId);

        if (structure && structure.length > 0) {
            await client.from('litany_structure').insert(
                structure.map(s => ({
                    litany_id:   newLit.id,
                    block_id:    s.block_id,
                    order_index: s.order_index,
                    user_count:  s.user_count,
                }))
            );
        }
        return newLit;
    },

    // ── Sessions ──────────────────────────────────────────────────────────────

    async getActiveSession(litanyId) {
        const { data } = await client
            .from('litany_sessions')
            .select('*')
            .eq('litany_id', litanyId)
            .eq('is_completed', false)
            .order('start_time', { ascending: false })
            .limit(1)
            .maybeSingle();
        return data || null;
    },

    async getAllSessions() {
        const { data, error } = await client
            .from('litany_sessions')
            .select('*, litanies(name)')
            .order('start_time', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async createSession(litanyId, mode, intent, sessionType) {
        const { data, error } = await client
            .from('litany_sessions')
            .insert({ litany_id: litanyId, mode, intent: intent || null, session_type: sessionType || 'freestyle' })
            .select().single();
        if (error) throw error;
        return data;
    },

    async getTodaysSessions() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const { data, error } = await client
            .from('litany_sessions')
            .select('*, litanies(name, schedule)')
            .gte('start_time', today.toISOString())
            .order('start_time', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async getInProgressSessions() {
        const { data, error } = await client
            .from('litany_sessions')
            .select('*, litanies(name, schedule)')
            .eq('is_completed', false)
            .order('last_active', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async saveProgress(sessionId, blockIdx, count) {
        await client.from('litany_sessions')
            .update({
                current_block_index: +blockIdx,
                current_count: +count,
                last_active: new Date().toISOString(),
            })
            .eq('id', sessionId);
    },

    async completeSession(sessionId) {
        await client.from('litany_sessions')
            .update({ is_completed: true, last_active: new Date().toISOString() })
            .eq('id', sessionId);
    },

    async abandonSession(sessionId) {
        await client.from('litany_sessions')
            .update({ is_completed: true })
            .eq('id', sessionId);
    },

    async clearAllPersonalData() {
        // Fetch all personal litany IDs first
        const { data: litanies } = await client
            .from('litanies')
            .select('id')
            .eq('is_preset', false);
        const ids = (litanies || []).map(l => l.id);
        if (ids.length) {
            // Cascade on litany delete handles sessions + structure
            await client.from('litanies').delete().in('id', ids);
        }
        // Also wipe any orphaned sessions
        await client.from('litany_sessions').delete().eq('is_completed', true);
    },
};
