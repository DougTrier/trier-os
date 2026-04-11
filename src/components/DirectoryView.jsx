// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Staff Directory
 * ===========================
 * Company-wide employee directory searchable by name, title, department,
 * and plant. Aggregates records from the Vendors table (Employee = 1) and
 * SiteLeadership table to present a unified people-finder.
 *
 * KEY FEATURES:
 *   - Full-text search: name, title, department, plant — debounced live filter
 *   - Contact cards: phone, email, plant location, department, role
 *   - Click-to-call: tel: link on mobile devices for one-tap dialing
 *   - Click-to-email: mailto: link for direct email compose
 *   - Department filter: narrow to Maintenance, Engineering, Operations, etc.
 *   - Plant filter: view staff at a specific facility or all plants
 *   - Leadership section: pinned site leads and managers at the top
 *   - Expertise tags: skills listed from employee profile for SME lookup
 *
 * DATA SOURCES:
 *   GET /api/directory   — Employee list from Vendors (Employee=1) + SiteLeadership
 */
import React, { useState, useEffect } from 'react';
import { PhoneCall, Mail, Building2, Users, Settings } from 'lucide-react';
import SearchBar from './SearchBar';
import { useTranslation } from '../i18n/index.jsx';
import { TakeTourButton } from './ContextualTour';

export default function DirectoryView({ plants, onEditLeadership, isAdminOrCreator }) {
    const { t } = useTranslation();
    const [directory, setDirectory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState(() => {
        const pending = localStorage.getItem('PF_NAV_SEARCH');
        if (pending) {
            localStorage.removeItem('PF_NAV_SEARCH');
            return pending;
        }
        return '';
    });

    const fetchDirectory = () => {
        fetch('/api/leadership/all', {
            headers: {  }
        })
            .then(res => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.json();
            })
            .then(data => {
                setDirectory(data || []);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to load directory', err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchDirectory();

        const handleRefresh = () => fetchDirectory();
        window.addEventListener('pf-refresh-directory', handleRefresh);
        return () => window.removeEventListener('pf-refresh-directory', handleRefresh);
    }, []);

    // Filter out corporate/all_sites entries — corporate contacts live in dashboard Q4 quadrant
    const filteredDirectory = directory
        .filter(entry => entry.siteId !== 'all_sites')
        .filter(entry => {
            const matchesSite = entry.siteLabel.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesLeader = entry.leaders.some(L =>
                L.Name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                L.Title.toLowerCase().includes(searchTerm.toLowerCase())
            );
            return matchesSite || matchesLeader;
        });

    if (loading) {
        return (
            <div className="glass-card" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                    <div className="spinner" style={{ marginBottom: '15px' }}></div>
                    <p>{t('directory.loadingEnterpriseDirectory')}</p>
                </div>
            </div>
        );
    }

    return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '20px', overflow: 'hidden' }}>
            <div className="glass-card" style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary)' }}>
                    <Users size={24} /> {t('directory.siteContactDirectory')}
                </h2>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <TakeTourButton tourId="directory" />
                <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder={t('directory.searchSitesOrPersonnel')} width={300} title={t('directory.searchBySiteNamePersonTip')} />
                </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px', paddingBottom: '20px' }}>
                {filteredDirectory.map((entry) => (
                    <div key={entry.siteId} className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '15px', padding: '20px', borderTop: '1px solid var(--glass-border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <Building2 size={20} color="var(--primary)" />
                                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{entry.siteLabel}</h3>
                            </div>
                            {isAdminOrCreator && (
                                <button 
                                    onClick={() => onEditLeadership({ id: entry.siteId, label: entry.siteLabel, leaders: entry.leaders })}
                                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem' }}
                                    title={`Edit leadership contacts for ${entry.siteLabel}`}
                                >
                                    <Settings size={12} /> {t('directory.editAll')}
                                </button>
                            )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {entry.leaders.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', fontStyle: 'italic' }}>{t('directory.noLeadershipListedFor')}</p>
                            ) : entry.leaders.map((leader, idx) => (
                                <div key={idx} style={{ background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', position: 'relative' }}>
                                    {isAdminOrCreator && (
                                        <button 
                                            onClick={() => onEditLeadership({ id: entry.siteId, label: entry.siteLabel, leaders: entry.leaders })}
                                            style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', opacity: 0.6 }}
                                            title={t('directory.editThisContact')}
                                        >
                                            <Settings size={14} />
                                        </button>
                                    )}
                                    <div style={{ fontWeight: 600, color: '#fff', fontSize: '1rem' }}>{leader.Name}</div>
                                    <div style={{ color: 'var(--primary)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{leader.Title}</div>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {leader.Phone && (
                                            <a href={`tel:${leader.Phone}`} style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }} title={`Call ${leader.Name} at ${leader.Phone}`}>
                                                <PhoneCall size={14} /> {leader.Phone}
                                            </a>
                                        )}
                                        {leader.Email && (
                                            <a href={`mailto:${leader.Email}`} style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }} title={`Email ${leader.Name}`}>
                                                <Mail size={14} /> {leader.Email}
                                            </a>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
