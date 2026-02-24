// ─── modals.js — Modal open/close + per-modal setup ──────────────────────────

import { getState, setState } from '../state.js';
import { db } from '../db.js';
import { showToast } from './toast.js';

let _onDeleteConfirm = null;
let _pendingBlockId   = null;
let _pendingBlockTitle = null;
let _manageBlocksLitanyId = null;

// ── Open / Close ──────────────────────────────────────────────────────────────

export function openModal(name, data = {}) {
    setState({ modal: name, modalData: data });
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('show');

    // Hide all modals first, then show the target
    document.querySelectorAll('.bottom-modal').forEach(m => m.classList.remove('active'));
    const target = document.getElementById(`modal-${name}`);
    if (target) target.classList.add('active');
}

export function closeModal() {
    setState({ modal: null, modalData: {} });
    document.getElementById('modal-overlay').classList.remove('show');
    document.querySelectorAll('.bottom-modal').forEach(m => m.classList.remove('active'));
}

// ── New Litany ────────────────────────────────────────────────────────────────

export function openNewLitanyModal({ onCreated }) {
    document.getElementById('new-litany-name').value = '';
    document.getElementById('new-litany-desc').value = '';
    openModal('new-litany');
    setTimeout(() => document.getElementById('new-litany-name').focus(), 150);

    document.getElementById('modal-new-litany-confirm').onclick = async () => {
        const name = document.getElementById('new-litany-name').value.trim();
        const desc = document.getElementById('new-litany-desc').value.trim();
        if (!name) { document.getElementById('new-litany-name').focus(); return; }
        try {
            await db.createLitany(name, desc);
            closeModal();
            if (onCreated) onCreated();
        } catch (_) {
            showToast('Could not create litany.');
        }
    };
}

// ── Add Block ─────────────────────────────────────────────────────────────────

export async function openAddBlockModal(blockId, blockTitle) {
    _pendingBlockId    = blockId;
    _pendingBlockTitle = blockTitle;

    document.getElementById('add-block-title').textContent = `Add "${blockTitle}"`;
    document.getElementById('add-block-count').value = '33';

    // Populate litany selector
    let litanies = [];
    try { litanies = await db.getLitanies(); } catch (_) {}
    const select = document.getElementById('add-block-litany-select');
    select.innerHTML = litanies.length
        ? litanies.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')
        : '<option disabled selected>No litanies — create one on Home first</option>';

    openModal('add-block');

    document.getElementById('modal-add-block-confirm').onclick = async () => {
        const litanyId = select.value;
        const count = parseInt(document.getElementById('add-block-count').value, 10);
        if (!litanyId || !count || count < 1) return;
        try {
            await db.addBlockToLitany(litanyId, _pendingBlockId, count);
            closeModal();
            const litName = litanies.find(l => l.id === litanyId)?.name || 'litany';
            showToast(`Added to "${litName}"`);
        } catch (_) {
            showToast('Failed to add block.');
        }
    };
}

// ── Manage Blocks ─────────────────────────────────────────────────────────────

export async function openManageBlocksModal(litanyId, litanyName) {
    _manageBlocksLitanyId = litanyId;
    document.getElementById('manage-blocks-title').textContent = litanyName;

    await renderManageList(litanyId);
    openModal('manage-blocks');
}

async function renderManageList(litanyId) {
    const list = document.getElementById('manage-blocks-list');
    list.innerHTML = '<p class="loading-text">Loading…</p>';
    try {
        const blocks = await db.getBlocksForLitany(litanyId);
        if (!blocks.length) {
            list.innerHTML = '<p class="loading-text">No blocks yet. Add some from Explore.</p>';
            return;
        }
        list.innerHTML = blocks.map(b => `
            <div class="manage-block-row" data-sid="${esc(String(b.id))}">
                <div class="manage-block-info">
                    <span class="manage-block-title">${esc(b.adhkar_blocks.title)}</span>
                    <span class="manage-block-count">×${b.user_count}</span>
                </div>
                <button class="btn-remove-block" data-sid="${esc(String(b.id))}" aria-label="Remove">✕</button>
            </div>
        `).join('');

        list.querySelectorAll('.btn-remove-block').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await db.removeBlockFromLitany(btn.dataset.sid);
                    await renderManageList(litanyId);
                } catch (_) {
                    showToast('Could not remove block.');
                }
            });
        });
    } catch (_) {
        list.innerHTML = '<p class="loading-text">Failed to load blocks.</p>';
    }
}

// ── Confirm Delete ────────────────────────────────────────────────────────────

export function openConfirmDeleteModal(litanyName, onConfirm) {
    _onDeleteConfirm = onConfirm;
    document.getElementById('confirm-delete-text').textContent =
        `Delete "${litanyName}"? This cannot be undone.`;
    openModal('confirm-delete');

    document.getElementById('modal-confirm-delete-confirm').onclick = async () => {
        closeModal();
        if (_onDeleteConfirm) _onDeleteConfirm();
    };
}

// ── Init (bind static close handlers) ────────────────────────────────────────

export function initModals() {
    // Close on overlay click
    document.getElementById('modal-overlay').addEventListener('click', e => {
        if (e.target.id === 'modal-overlay') closeModal();
    });

    document.getElementById('modal-new-litany-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-add-block-cancel').addEventListener('click', closeModal);
    document.getElementById('modal-manage-blocks-close').addEventListener('click', closeModal);
    document.getElementById('modal-confirm-delete-cancel').addEventListener('click', closeModal);
}

// ── Util ──────────────────────────────────────────────────────────────────────

function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
