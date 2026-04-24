// Copyright © 2026 Trier OS. All Rights Reserved.

import React, { useState, useEffect } from 'react';
import { AlertTriangle, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';

export default function SOPAcknowledgmentBanner({ plantId }) {
    const { t } = useTranslation();
    const [pendingSOPs, setPendingSOPs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    
    useEffect(() => {
        if (!plantId) return;
        
        const fetchPending = async () => {
            try {
                const res = await fetch(`/api/sop-acknowledgment/pending?plantId=${encodeURIComponent(plantId)}`);
                if (res.ok) {
                    const data = await res.json();
                    setPendingSOPs(data || []);
                }
            } catch (err) {
                console.error('Failed to fetch pending SOPs:', err);
            } finally {
                setLoading(false);
            }
        };
        
        fetchPending();
    }, [plantId]);
    
    const handleAcknowledge = async (procId) => {
        try {
            const res = await fetch(`/api/sop-acknowledgment/${procId}/acknowledge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plantId })
            });
            
            if (res.ok) {
                setPendingSOPs(prev => prev.filter(p => p.ID !== procId));
            }
        } catch (err) {
            console.error('Failed to acknowledge SOP:', err);
        }
    };
    
    if (loading || pendingSOPs.length === 0) return null;
    
    return (
        <>
            <div 
                onClick={() => setShowModal(true)}
                className="mb-4 flex items-center justify-between p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg cursor-pointer hover:bg-amber-500/20 transition-colors"
            >
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500/20 rounded-full">
                        <AlertTriangle size={18} className="text-amber-400" />
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-amber-400">
                            {t('SOP Acknowledgment Required')}
                        </h4>
                        <p className="text-xs text-amber-400/80 mt-0.5">
                            {pendingSOPs.length} {pendingSOPs.length === 1 ? 'procedure has' : 'procedures have'} changes that require your review.
                        </p>
                    </div>
                </div>
                <ChevronRight size={18} className="text-amber-400/60" />
            </div>

            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                    <div className="bg-[#1e222a] border border-white/10 rounded-xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden max-h-[90vh]">
                        <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                            <h2 className="text-lg font-bold text-white flex items-center gap-2">
                                <AlertTriangle size={20} className="text-amber-400" />
                                {t('Pending SOP Acknowledgments')}
                            </h2>
                            <button 
                                onClick={() => setShowModal(false)}
                                className="text-white/50 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        
                        <div className="p-4 overflow-y-auto flex-1">
                            {pendingSOPs.length === 0 ? (
                                <div className="text-center py-8 text-white/50">
                                    <CheckCircle2 size={48} className="mx-auto mb-4 text-emerald-400 opacity-50" />
                                    <p>All required procedures have been acknowledged.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {pendingSOPs.map(sop => (
                                        <div key={sop.ID} className="bg-white/5 border border-white/10 rounded-lg p-4">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h3 className="font-semibold text-white text-lg">
                                                        {sop.ProcedureCode ? `${sop.ProcedureCode} - ` : ''}{sop.Descript || 'Unnamed Procedure'}
                                                    </h3>
                                                    <p className="text-sm text-white/50 mt-1">
                                                        Updated: {new Date(sop.Updated).toLocaleDateString()}
                                                    </p>
                                                </div>
                                                <button
                                                    onClick={() => handleAcknowledge(sop.ID)}
                                                    className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-500/30 transition-colors flex items-center gap-2 text-sm font-medium"
                                                >
                                                    <CheckCircle2 size={16} />
                                                    {t('Acknowledge & Sign')}
                                                </button>
                                            </div>
                                            <div className="text-sm text-white/70 bg-black/20 p-3 rounded border border-white/5">
                                                I confirm that I have read and understood the changes made to this procedure, and I am qualified to execute it safely.
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        <div className="p-4 border-t border-white/10 bg-white/5 flex justify-end">
                            <button 
                                onClick={() => setShowModal(false)}
                                className="px-4 py-2 border border-white/20 rounded text-white hover:bg-white/5"
                            >
                                {t('Close')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
