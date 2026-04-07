// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Plant Chat & Messaging
 * ===================================
 * Real-time messaging interface for plant-level team communication.
 * Polls the REST API every 5 seconds for new messages; falls back
 * gracefully to offline mode with a reconnect indicator.
 *
 * KEY FEATURES:
 *   - Conversation threads: per-topic channels (General, Maintenance, Safety, etc.)
 *   - @mentions: notify specific users; highlighted in their notification center
 *   - User presence: online/offline indicator dot per team member
 *   - Message search: full-text search across all conversation history
 *   - File attachments: images and PDF files embedded in message thread
 *   - Push-to-Talk: voice note recording via PushToTalkButton (transcribed on send)
 *   - Content filter: profanity/policy screening via checkContent() utility
 *   - Knowledge Expert directory: searchable SME list by skill/equipment type
 *   - Message retention: configurable rolling window (30/60/90/365 days)
 *
 * API CALLS:
 *   GET    /api/chat/messages          — Load conversation history
 *   POST   /api/chat/messages          — Send a new message
 *   DELETE /api/chat/messages/:id      — Delete own message
 *   GET    /api/chat/experts           — Knowledge Expert directory
 */
import React, { useState, useEffect, useRef } from 'react';
import { Send, MessageSquare, AtSign, User, Plus, Paperclip, FileText, X, Trash2, Search, ImageIcon } from 'lucide-react';
import PushToTalkButton from './PushToTalkButton';
import { checkContent } from '../utils/contentFilter';
import SmartDialog from './SmartDialog';
import DraftManager from '../utils/DraftManager';
import RoleAvatar from './RoleAvatar';
import { useTranslation } from '../i18n/index.jsx';
import { formatDate } from '../utils/formatDate';
import { TakeTourButton } from './ContextualTour';

export default function ChatView({ selectedPlant, plants }) {
    const { t, lang } = useTranslation();

    // Open Google Translate in new tab with message pre-filled
    const openTranslate = (text) => {
        const gtLang = { en:'en', es:'es', fr:'fr', de:'de', zh:'zh-CN', pt:'pt', ja:'ja', ko:'ko', ar:'ar', hi:'hi', tr:'tr' }[lang] || 'en';
        const url = `https://translate.google.com/?sl=auto&tl=${gtLang}&text=${encodeURIComponent(text)}&op=translate`;
        window.open(url, '_blank', 'noopener');
    };
    // Use main application auth state instead of separate chat profiles
    const mainUser = {
        fullName: localStorage.getItem('currentUser') || 'Unknown User',
        email: (localStorage.getItem('currentUser') || 'system').toLowerCase().replace(/\s+/g, '.') + '@trier-os.com',
        plantId: localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
    };

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [dialog, setDialog] = useState(null);

    // Chat / Forum States
    const [topics, setTopics] = useState([]);
    const [activeTopic, setActiveTopic] = useState('general');
    const [newTopicName, setNewTopicName] = useState('');
    const [isCreatingTopic, setIsCreatingTopic] = useState(false);

    const [globalMessages, setGlobalMessages] = useState([]);
    const [topicMessages, setTopicMessages] = useState([]);

    const [globalInput, setGlobalInput] = useState('');
    const [topicInput, setTopicInput] = useState('');

    const [topicAttachment, setTopicAttachment] = useState(null);

    const globalScrollRef = useRef(null);
    const topicScrollRef = useRef(null);

    // Knowledge Search States
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState(null);
    const [isSearching, setIsSearching] = useState(false);

    // Roles
    const isAdmin = localStorage.getItem('userRole') === 'admin' || 
                    localStorage.getItem('userRole') === 'it_admin' || 
                    localStorage.getItem('userRole') === 'creator' ||
                    localStorage.getItem('PF_USER_IS_CREATOR') === 'true';

    // Initial Fetch & Poll
    useEffect(() => {
        fetchTopics();
        fetchGlobalMessages();
        if (activeTopic) fetchTopicMessages();

        const interval = setInterval(() => {
            fetchGlobalMessages();
            if (activeTopic) fetchTopicMessages();
        }, 5000);
        return () => clearInterval(interval);
    }, [activeTopic]);

    const fetchTopics = async () => {
        try {
            const res = await fetch('/api/chat/topics');
            if (!res.ok) return;
            const data = await res.json();
            if (!Array.isArray(data)) return;
            setTopics(data);
            if (!activeTopic && data.length > 0) setActiveTopic(data[0].ID);
        } catch (err) { console.error('Failed to fetch topics'); }
    };

    // Institutional Knowledge Search
    const handleKnowledgeSearch = async (e) => {
        if (e) e.preventDefault();
        if (!searchQuery.trim() || searchQuery.trim().length < 2) return;
        setIsSearching(true);
        try {
            const res = await fetch(`/api/chat/search?q=${encodeURIComponent(searchQuery.trim())}`, {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
            });
            const data = await res.json();
            setSearchResults(data);
        } catch (err) {
            console.error('Knowledge search failed:', err);
        } finally {
            setIsSearching(false);
        }
    };

    const clearSearch = () => {
        setSearchQuery('');
        setSearchResults(null);
    };

    // Message Draft Logic
    useEffect(() => {
        // Load initial drafts
        const gDraft = DraftManager.get('CHAT_GLOBAL', 'all_sites');
        if (gDraft) setGlobalInput(gDraft);

        if (activeTopic) {
            const tDraft = DraftManager.get(`CHAT_TOPIC_${activeTopic}`, 'all_sites');
            if (tDraft) setTopicInput(tDraft);
        }
    }, [activeTopic]);

    // Auto-save drafts
    useEffect(() => {
        if (globalInput) DraftManager.save('CHAT_GLOBAL', globalInput, 'all_sites');
        else DraftManager.clear('CHAT_GLOBAL', 'all_sites');
    }, [globalInput]);

    useEffect(() => {
        if (activeTopic) {
            if (topicInput) DraftManager.save(`CHAT_TOPIC_${activeTopic}`, topicInput, 'all_sites');
            else DraftManager.clear(`CHAT_TOPIC_${activeTopic}`, 'all_sites');
        }
    }, [topicInput, activeTopic]);

    const fetchGlobalMessages = async () => {
        try {
            const res = await fetch('/api/chat/messages?topicId=global');
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data)) setGlobalMessages(data);
        } catch (err) { console.warn('[ChatView] caught:', err); }
    };

    const fetchTopicMessages = async () => {
        if (!activeTopic) return;
        try {
            const res = await fetch(`/api/chat/messages?topicId=${activeTopic}`);
            if (!res.ok) return;
            const data = await res.json();
            if (Array.isArray(data)) setTopicMessages(data);
        } catch (err) { console.warn('[ChatView] caught:', err); }
    };

    useEffect(() => {
        if (globalScrollRef.current) globalScrollRef.current.scrollTop = globalScrollRef.current.scrollHeight;
    }, [globalMessages]);

    useEffect(() => {
        if (topicScrollRef.current) topicScrollRef.current.scrollTop = topicScrollRef.current.scrollHeight;
    }, [topicMessages]);

    const handleCreateTopic = async (e) => {
        e.preventDefault();
        if (!newTopicName.trim()) return;

        const violations = checkContent(newTopicName);
        if (violations) {
            setDialog({
                type: 'warning',
                title: 'Topic Title Restricted',
                message: `The group name contains inappropriate language: "${violations.join(', ')}". Please use professional language for corporate discussion groups.`,
                isAlert: true,
                onConfirm: () => setDialog(null)
            });
            return;
        }

        if (!isAdmin) {
            setDialog({
                type: 'error',
                title: 'Access Denied',
                message: 'You do not have permission to create new discussion groups. This feature is restricted to Administrators and the Platform Creator.',
                isAlert: true,
                onConfirm: () => setDialog(null)
            });
            return;
        }

        try {
            const res = await fetch('/api/chat/topics', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ label: newTopicName, createdBy: mainUser.fullName })
            });
            const data = await res.json();
            if (data.success) {
                setNewTopicName('');
                setIsCreatingTopic(false);
                setActiveTopic(data.id);
                fetchTopics();
            }
        } catch (err) { console.error('Failed to create topic'); }
    }

    const sendMessage = async (isGlobal, e) => {
        if (e) e.preventDefault();
        const inputStr = isGlobal ? globalInput : topicInput;

        if (!inputStr.trim() && (!topicAttachment || isGlobal)) return;

        const violations = checkContent(inputStr);
        if (violations) {
            setDialog({
                type: 'error',
                title: 'Professional Standards Violation',
                message: `Your message contains prohibited language: "${violations.join(', ')}". Inappropriate language or sexual content is strictly forbidden on the Trier OS maintenance platform to maintain enterprise standards.`,
                isAlert: true,
                onConfirm: () => setDialog(null)
            });
            return;
        }

        const formData = new FormData();
        formData.append('message', inputStr);
        formData.append('senderName', mainUser.fullName);
        formData.append('senderPlantId', mainUser.plantId);
        formData.append('senderEmail', mainUser.email);
        formData.append('topicId', isGlobal ? 'global' : activeTopic);
        formData.append('mentions', inputStr.match(/@(\w+)/g)?.join(',') || '');

        if (!isGlobal && topicAttachment) {
            formData.append('attachment', topicAttachment);
        }

        try {
            await fetch('/api/chat/messages', {
                method: 'POST',
                body: formData
            });

            if (isGlobal) {
                setGlobalInput('');
                DraftManager.clear('CHAT_GLOBAL', 'all_sites');
                fetchGlobalMessages();
            } else {
                setTopicInput('');
                DraftManager.clear(`CHAT_TOPIC_${activeTopic}`, 'all_sites');
                setTopicAttachment(null);
                fetchTopicMessages();
            }
        } catch (err) {
            console.error('Failed to send');
        }
    };

    const handleDeleteTopic = (id, e) => {
        e.stopPropagation();
        setDialog({
            type: 'warning',
            title: 'Delete Discussion Group?',
            message: 'Are you sure you want to permanently delete this topic and all of its messages? This action is irreversible.',
            confirmLabel: 'Delete Forever',
            onConfirm: async () => {
                try {
                    await fetch(`/api/chat/topics/${id}`, { method: 'DELETE' });
                    if (activeTopic === id) setActiveTopic('general');
                    fetchTopics();
                    setDialog(null);
                } catch (err) { console.error('Error deleting topic'); }
            },
            onCancel: () => setDialog(null)
        });
    };

    const handleDeleteMessage = (id, isGlobal) => {
        setDialog({
            type: 'warning',
            title: 'Delete Message?',
            message: 'Are you sure you want to remove this message from the record?',
            confirmLabel: 'Delete',
            onConfirm: async () => {
                try {
                    await fetch(`/api/chat/messages/${id}`, { method: 'DELETE' });
                    if (isGlobal) fetchGlobalMessages();
                    else fetchTopicMessages();
                    setDialog(null);
                } catch (err) { console.error('Error deleting msg'); }
            },
            onCancel: () => setDialog(null)
        });
    };


    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setTopicAttachment(e.target.files[0]);
        }
    };

    const renderMessage = (msg, i, currentRefArray) => {
        const isMe = msg.SenderEmail === mainUser?.email;
        const hasMention = msg.Message && msg.Message.includes(`@${mainUser?.fullName.split(' ')[0]}`);

        const isImage = msg.AttachmentName && msg.AttachmentName.match(/\.(jpeg|jpg|gif|png|webp)$/i);

        return (
            <div key={i} style={{
                alignSelf: isMe ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: isMe ? 'flex-end' : 'flex-start'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    <strong>{msg.SenderName}</strong>
                    <span>•</span>
                    <span>{new Date(msg.CreatedAt + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>

                    {msg.Message && (
                        <button onClick={() => openTranslate(msg.Message)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 2px', marginLeft: '3px', fontSize: '0.7rem', opacity: 0.6, transition: 'opacity 0.2s' }} onMouseEnter={e => e.target.style.opacity = 1} onMouseLeave={e => e.target.style.opacity = 0.6} title={t('chat.translateThisMessage') || 'Translate this message'}>
                            🌐
                        </button>
                    )}
                    {isAdmin && (
                        <button onClick={() => handleDeleteMessage(msg.ID, msg.TopicId === 'global')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: 0, marginLeft: '5px' }} title={t('chat.deleteMessageAdminOnly')}>
                            <Trash2 size={12} />
                        </button>
                    )}
                </div>
                <div style={{
                    padding: '10px 15px',
                    borderRadius: '12px',
                    background: isMe ? 'var(--primary)' : 'rgba(255,255,255,0.05)',
                    color: '#fff',
                    border: hasMention ? '1px solid #facc15' : '1px solid var(--glass-border)',
                    animation: hasMention ? 'pulse 2s infinite' : 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                }}>
                    {msg.Message && <div>{msg.Message}</div>}

                    {msg.AttachmentUrl && (
                        <div style={{ marginTop: '5px', padding: '8px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                            {isImage ? (
                                <a href={msg.AttachmentUrl} target="_blank" rel="noreferrer">
                                    <img src={msg.AttachmentUrl} alt="attachment" style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '4px', cursor: 'zoom-in' }} />
                                </a>
                            ) : (
                                <a href={msg.AttachmentUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#fff', textDecoration: 'none', fontSize: '0.85rem' }}>
                                    <FileText size={16} className="text-primary" /> {msg.AttachmentName}
                                </a>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="chat-wrapper" style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: 'calc(100vh - 200px)' }}>
            {dialog && <SmartDialog {...dialog} />}
            
            <div className="chat-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <MessageSquare className="text-primary" />
                    <TakeTourButton tourId="chat" />
                    <h2 style={{ margin: 0 }}>{t('chat.maintenanceKnowledgeExchange')}</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    {/* Institutional Knowledge Search Bar */}
                    <form onSubmit={handleKnowledgeSearch} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <Search size={16} style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                            <input
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder={t('chat.searchTribalKnowledge')}
                                style={{ ...inputStyle, paddingLeft: '32px', width: '240px', fontSize: '0.85rem', background: 'rgba(0,0,0,0.3)' }}
                                title={t('chat.searchPastDiscussionsForInstitutionalTip')}
                            />
                            {searchResults && (
                                <button type="button" onClick={clearSearch} style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }} title={t('chat.clearSearchResultsTip')}>
                                    <X size={14} />
                                </button>
                            )}
                        </div>
                        <button type="submit" disabled={isSearching} className="btn-primary btn-sm" title={t('chat.searchAllChatChannelsForTip')}>
                            {isSearching ? '...' : 'Search'}
                        </button>
                    </form>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <RoleAvatar role={localStorage.getItem('userRole') || 'employee'} size={32} />
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{mainUser.fullName}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{mainUser.plantId === 'all_sites' ? 'Corporate Office' : plants?.find(p => p.id === mainUser.plantId)?.label || mainUser.plantId}</div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="chat-layout" style={{ flex: 1, display: 'flex', gap: '20px', overflow: 'hidden' }}>

                {/* LEFT FOREGROUND: FORUM CHANNELS */}
                <div className="glass-card chat-channels" style={{ width: '220px', display: 'flex', flexDirection: 'column', padding: '15px', flexShrink: 0, overflowY: 'auto' }} title={t('chat.discussionGroupsMenu')}>
                    <h3 style={{ fontSize: '1rem', marginTop: 0, marginBottom: '15px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        Groups
                        {isAdmin && (
                            <button onClick={() => setIsCreatingTopic(!isCreatingTopic)} style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer' }} title={t('chat.createNewDiscussionGroup')}>
                                <Plus size={16} />
                            </button>
                        )}
                    </h3>

                    {isCreatingTopic && (
                        <form onSubmit={handleCreateTopic} style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '15px', padding: '10px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                            <input autoFocus value={newTopicName} onChange={e => setNewTopicName(e.target.value)} placeholder={t('chat.newTopicName')} style={{ ...inputStyle, padding: '8px', fontSize: '0.8rem' }} title={t('chat.enterANameForTheTip')} />
                            <div style={{ display: 'flex', gap: '5px' }}>
                                <button type="submit" className="btn-primary btn-sm" style={{ flex: 1 }} title={t('chat.createThisDiscussionGroupTip')}>{t('chat.add')}</button>
                                <button type="button" onClick={() => setIsCreatingTopic(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', padding: '5px', borderRadius: '4px', cursor: 'pointer' }} title={t('chat.cancelCreatingNewGroupTip')}><X size={14} /></button>
                            </div>
                        </form>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        {topics.map(topic => (
                            <div
                                key={topic.ID}
                                onClick={() => setActiveTopic(topic.ID)}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    gap: '8px',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    background: activeTopic === topic.ID ? 'var(--primary)' : 'transparent',
                                    color: activeTopic === topic.ID ? '#fff' : 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '0.9rem',
                                    transition: 'all 0.2s'
                                }}
                                className="nav-item-hover"
                            >
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    <span style={{ opacity: 0.5, marginRight: '8px' }}>#</span>
                                    {topic.Label}
                                </div>
                                {isAdmin && topic.ID !== 'general' && (
                                    <button 
                                        onClick={(e) => handleDeleteTopic(topic.ID, e)}
                                        style={{ background: 'none', border: 'none', color: activeTopic === topic.ID ? '#fff' : '#ef4444', cursor: 'pointer', opacity: 0.7, padding: 0 }}
                                        title={t('chat.deleteGroupAndAll')}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* CENTER FOREGROUND: SEARCH RESULTS or FORUM THREAD */}
                {searchResults ? (
                    <div className="glass-card" style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                        <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(99, 102, 241, 0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '1rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Search size={16} color="var(--primary)" />
                                    {t('chat.knowledgeSearchResults')}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {searchResults.total} matches for "{searchResults.query}" across all channels
                                </div>
                            </div>
                            <button onClick={clearSearch} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }} title={t('chat.clearSearchResultsAndReturnTip')}>{t('chat.clearSearch')}</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
                            {searchResults.results.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                                    <Search size={40} style={{ opacity: 0.3, marginBottom: '10px' }} />
                                    <p>{t('chat.noMatchesFoundTry')}</p>
                                </div>
                            ) : (
                                searchResults.results.map((r, i) => (
                                    <div
                                        key={r.ID}
                                        onClick={() => {
                                            setActiveTopic(r.TopicId);
                                            clearSearch();
                                        }}
                                        style={{
                                            padding: '15px',
                                            borderRadius: '10px',
                                            border: '1px solid var(--glass-border)',
                                            marginBottom: '10px',
                                            cursor: 'pointer',
                                            background: 'rgba(255,255,255,0.02)',
                                            transition: 'all 0.2s'
                                        }}
                                        className="nav-item-hover"
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <strong style={{ fontSize: '0.9rem' }}>{r.SenderName}</strong>
                                                <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                                                    #{r.TopicLabel || r.TopicId}
                                                </span>
                                            </div>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                {formatDate(r.CreatedAt + 'Z')} {new Date(r.CreatedAt + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#ccc', lineHeight: '1.5' }}>
                                            {r.snippet}
                                        </div>
                                        {r.AttachmentName && (
                                            <div style={{ marginTop: '6px', fontSize: '0.75rem', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                <Paperclip size={12} /> {r.AttachmentName}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                ) : (
                <div className="glass-card chat-thread" style={{ flex: 2, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                    <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)' }}>
                        <div style={{ fontSize: '1rem', fontWeight: 'bold' }}>
                            <span style={{ color: 'var(--primary)', marginRight: '5px' }}>#</span>
                            {topics.find(topic => topic.ID === activeTopic)?.Label || 'Select a topic'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('chat.forumDiscussionGroup')}</div>
                    </div>

                    <div ref={topicScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {topicMessages.length === 0 ? (
                            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>{t('chat.noPostsInThis')}</div>
                        ) : (
                            topicMessages.map((msg, i) => renderMessage(msg, i, topicMessages))
                        )}
                    </div>

                    <form onSubmit={(e) => sendMessage(false, e)} style={{ padding: '15px', borderTop: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {topicAttachment && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.2)', padding: '5px 10px', borderRadius: '4px', alignSelf: 'flex-start', fontSize: '0.8rem' }}>
                                <Paperclip size={14} className="text-primary" />
                                <span>{topicAttachment.name}</span>
                                <button type="button" onClick={() => setTopicAttachment(null)} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', padding: '0 5px' }} title={t('chat.removeThisAttachmentTip')}><X size={14} /></button>
                            </div>
                        )}
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--glass-border)', borderRadius: '8px', cursor: 'pointer', padding: '0 15px', color: 'var(--text-muted)' }} title={t('chat.attachAFileOr')}>
                                <ImageIcon size={18} />
                                <input type="file" onChange={handleFileChange} style={{ display: 'none' }} title={t('chat.selectAFileToAttachTip')} />
                            </label>

                            <PushToTalkButton 
                                onResult={(text) => setTopicInput(prev => prev + ' ' + text)}
                            />

                            <input
                                value={topicInput}
                                onChange={e => setTopicInput(e.target.value)}
                                placeholder={t('chat.postToThisGroup')}
                                style={{ ...inputStyle, background: 'rgba(0,0,0,0.2)', flex: 1 }}
                                title={t('chat.typeAMessageToPostTip')}
                            />
                            <button type="submit" className="btn-primary btn-sm" title={t('chat.sendGroupMessage')}>
                                <Send size={18} />
                            </button>
                        </div>
                    </form>
                </div>
                )}

                {/* RIGHT FOREGROUND: GLOBAL CHAT */}
                <div className="glass-card chat-global" style={{ flex: 1, minWidth: '300px', maxWidth: '350px', display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }} title={t('chat.globalCorporateWideChat')}>
                    <div style={{ padding: '15px 20px', borderBottom: '1px solid var(--glass-border)', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                            <AtSign size={14} style={{ marginRight: '5px', verticalAlign: 'middle' }} /> {t('chat.globalLiveChat')}
                        </div>
                    </div>

                    <div ref={globalScrollRef} style={{ flex: 1, overflowY: 'auto', padding: '15px', display: 'flex', flexDirection: 'column', gap: '15px', background: 'rgba(0,0,0,0.1)' }}>
                        {globalMessages.map((msg, i) => renderMessage(msg, i, globalMessages))}
                    </div>

                    <form onSubmit={(e) => sendMessage(true, e)} style={{ padding: '12px', borderTop: '1px solid var(--glass-border)', display: 'flex', gap: '8px', background: 'rgba(255,255,255,0.02)' }}>
                        <input
                            value={globalInput}
                            onChange={e => setGlobalInput(e.target.value)}
                            placeholder={t('chat.typeAGlobalMessage')}
                            style={{ ...inputStyle, background: 'rgba(0,0,0,0.3)', padding: '10px 12px', fontSize: '0.85rem' }}
                            title={t('chat.typeAMessageVisibleToTip')}
                        />
                        <PushToTalkButton 
                            onResult={(text) => setGlobalInput(prev => prev + ' ' + text)}
                        />
                        <button type="submit" className="btn-primary btn-sm" title={t('chat.sendGlobalMessage')}>
                            <Send size={16} />
                        </button>
                    </form>
                </div>

            </div>

            <style>{`
                @keyframes pulse {
                    0% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0.4); }
                    70% { box-shadow: 0 0 0 10px rgba(250, 204, 21, 0); }
                    100% { box-shadow: 0 0 0 0 rgba(250, 204, 21, 0); }
                }
            `}</style>
        </div>
    );
}

const inputStyle = {
    padding: '12px',
    borderRadius: '8px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid var(--glass-border)',
    color: '#fff',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box'
};
