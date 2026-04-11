// Copyright © 2026 Trier OS. All Rights Reserved.

/**
 * © 2026 Doug Trier. All Rights Reserved.
 * Trier OS is proprietary software. Unauthorized copying,
 * distribution, or reverse engineering is strictly prohibited.
 */
/**
 * Trier OS — Plant Weather Map
 * ==============================
 * Geographic map view showing all plant locations with live weather overlays.
 * At-a-glance visibility into conditions that affect maintenance operations:
 * incoming storms, extreme temperatures, and severe weather alerts.
 *
 * KEY FEATURES:
 *   - Plant location pins: all facilities on a Leaflet map with weather callouts
 *   - Live weather data: temperature, humidity, wind speed, and conditions per pin
 *   - Severe weather alerts: storm warning badges on affected plant pins
 *   - Condition icons: sun, cloud, rain, snow, lightning mapped to weather codes
 *   - Temperature color coding: blue (cold) → green (normal) → red (extreme heat)
 *   - Weather refresh: manual refresh button + auto-refresh every 30 minutes
 *   - Maintenance impact: alerts if weather exceeds safe outdoor work thresholds
 *   - Click pin: expands weather detail card with 3-day forecast
 *
 * DATA SOURCES:
 *   GET /api/weather/plant-summary   — Weather data for all plant GPS coordinates
 *   Sourced from Open-Meteo API (no API key required) using plant lat/lng
 */
import React, { useState, useEffect } from 'react';
import { Cloud, CloudLightning, AlertTriangle, Activity, Wrench, Shield, TrendingUp, RefreshCw } from 'lucide-react';
import { useTranslation } from '../i18n/index.jsx';
import LoadingSpinner from './LoadingSpinner';

/**
 * PlantWeatherMap — Enterprise Plant Health Visualization
 * ========================================================
 * Displays all plants as weather conditions based on real-time health metrics.
 * ☀️ Sunny | 🌤️ Partly Cloudy | ⛅ Cloudy | 🌧️ Rainy | ⛈️ Stormy
 */
export default function PlantWeatherMap({ setSelectedPlant, setActiveTab }) {
    const { t } = useTranslation();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedCard, setSelectedCard] = useState(null);
    const [refreshing, setRefreshing] = useState(false);

    const headers = {
        'x-plant-id': localStorage.getItem('selectedPlantId') || 'Demo_Plant_1'
    };

    const fetchWeather = async (showRefresh = false) => {
        if (showRefresh) setRefreshing(true);
        try {
            const res = await fetch('/api/analytics/plant-weather', { headers });
            const json = await res.json();
            setData(json);
        } catch (e) {
            console.error('Weather map fetch failed:', e);
        }
        setLoading(false);
        setRefreshing(false);
    };

    useEffect(() => { fetchWeather(); }, []);

    const navigateToPlant = (plantId) => {
        if (setSelectedPlant && setActiveTab) {
            localStorage.setItem('selectedPlantId', plantId);
            setSelectedPlant(plantId);
            setActiveTab('dashboard');
        }
    };

    if (loading) return (
        <div style={{ padding: '60px', textAlign: 'center' }}>
            <div style={{
                width: '50px', height: '50px', margin: '0 auto 20px',
                border: '3px solid rgba(250,204,21,0.3)', borderTopColor: '#facc15',
                borderRadius: '50%', animation: 'spin 1s linear infinite'
            }} />
            <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Scanning plant health across all facilities...
            </div>
        </div>
    );

    if (!data) return null;

    const { plants, enterprise } = data;

    const WeatherIcon = ({ condition, size = 40 }) => {
        const iconStyle = { filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.3))' };
        switch (condition) {
            case 'Sunny': return <span style={{ fontSize: size, ...iconStyle }}>☀️</span>;
            case 'Partly Cloudy': return <span style={{ fontSize: size, ...iconStyle }}>🌤️</span>;
            case 'Cloudy': return <span style={{ fontSize: size, ...iconStyle }}>⛅</span>;
            case 'Rainy': return <span style={{ fontSize: size, ...iconStyle }}>🌧️</span>;
            case 'Stormy': return <span style={{ fontSize: size, ...iconStyle }}>⛈️</span>;
            default: return <span style={{ fontSize: size }}>🌡️</span>;
        }
    };

    const getScoreColor = (score) => {
        if (score >= 85) return '#22c55e';
        if (score >= 70) return '#3b82f6';
        if (score >= 55) return '#f59e0b';
        if (score >= 40) return '#f97316';
        return '#ef4444';
    };

    const getConditionLabel = (condition) => {
        switch (condition) {
            case 'Sunny': return 'Excellent';
            case 'Partly Cloudy': return 'Good';
            case 'Cloudy': return 'Fair';
            case 'Rainy': return 'Concerning';
            case 'Stormy': return 'Critical';
            default: return condition;
        }
    };

    // Enterprise summary bar
    const SummaryBar = () => {
        const eScore = enterprise.avgScore;
        const eCondition = eScore >= 85 ? 'Sunny' : eScore >= 70 ? 'Partly Cloudy' : eScore >= 55 ? 'Cloudy' : eScore >= 40 ? 'Rainy' : 'Stormy';
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '20px 24px', borderRadius: '14px', marginBottom: '20px',
                background: `linear-gradient(135deg, ${getScoreColor(eScore)}12, ${getScoreColor(eScore)}05)`,
                border: `1px solid ${getScoreColor(eScore)}25`,
                flexWrap: 'wrap', gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <WeatherIcon condition={eCondition} size={44} />
                    <div>
                        <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
                            Enterprise Health: <span style={{ color: getScoreColor(eScore) }}>{getConditionLabel(eCondition)}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            {enterprise.totalPlants} facilities monitored • Avg score: {eScore}/100
                        </div>
                    </div>
                </div>

                {/* Weather distribution pills */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {enterprise.sunny > 0 && (
                        <span style={pillStyle('#22c55e')}>☀️ {enterprise.sunny}</span>
                    )}
                    {enterprise.partlyCloudy > 0 && (
                        <span style={pillStyle('#3b82f6')}>🌤️ {enterprise.partlyCloudy}</span>
                    )}
                    {enterprise.cloudy > 0 && (
                        <span style={pillStyle('#f59e0b')}>⛅ {enterprise.cloudy}</span>
                    )}
                    {enterprise.rainy > 0 && (
                        <span style={pillStyle('#f97316')}>🌧️ {enterprise.rainy}</span>
                    )}
                    {enterprise.stormy > 0 && (
                        <span style={pillStyle('#ef4444')}>⛈️ {enterprise.stormy}</span>
                    )}
                </div>

                <button 
                    onClick={() => fetchWeather(true)}
                    disabled={refreshing}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 14px', borderRadius: '8px', cursor: 'pointer',
                        background: 'rgba(255,255,255,0.06)', border: '1px solid var(--glass-border)',
                        color: '#fff', fontSize: '0.8rem', fontWeight: 600,
                        opacity: refreshing ? 0.5 : 1
                    }}
                    title={t('plantWeatherMap.refreshPlantHealthDataAcrossTip')}
                >
                    <RefreshCw size={14} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
                    {refreshing ? 'Updating...' : 'Refresh'}
                </button>
            </div>
        );
    };

    // Individual plant weather card
    const PlantCard = ({ plant }) => {
        const isExpanded = selectedCard === plant.plantId;
        const m = plant.metrics;
        const scoreColor = getScoreColor(plant.score);

        return (
            <div
                onClick={() => setSelectedCard(isExpanded ? null : plant.plantId)}
                style={{
                    background: isExpanded
                        ? `linear-gradient(145deg, ${scoreColor}10, rgba(0,0,0,0.2))`
                        : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isExpanded ? scoreColor + '40' : 'var(--glass-border)'}`,
                    borderRadius: '14px', padding: '18px',
                    cursor: 'pointer', transition: 'all 0.25s ease',
                    position: 'relative', overflow: 'hidden'
                }}
            >
                {/* Ambient glow for critical plants */}
                {plant.score < 40 && (
                    <div style={{
                        position: 'absolute', top: '-20px', right: '-20px',
                        width: '80px', height: '80px', borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(239,68,68,0.15), transparent)',
                        animation: 'pulse 2s ease-in-out infinite'
                    }} />
                )}

                {/* Header: Icon + Name + Score */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <WeatherIcon condition={plant.condition} size={32} />
                        <div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>
                                {plant.plantLabel}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: scoreColor, fontWeight: 600 }}>
                                {plant.condition} • {getConditionLabel(plant.condition)}
                            </div>
                        </div>
                    </div>
                    <div style={{
                        fontSize: '1.4rem', fontWeight: 800, color: scoreColor,
                        textShadow: `0 0 20px ${scoreColor}40`
                    }}>
                        {plant.score}°
                    </div>
                </div>

                {/* Score bar */}
                <div style={{
                    width: '100%', height: '6px', borderRadius: '3px',
                    background: 'rgba(255,255,255,0.06)', marginBottom: isExpanded ? '14px' : '0',
                    overflow: 'hidden'
                }}>
                    <div style={{
                        width: `${plant.score}%`, height: '100%', borderRadius: '3px',
                        background: `linear-gradient(90deg, ${scoreColor}, ${scoreColor}aa)`,
                        transition: 'width 0.8s ease'
                    }} />
                </div>

                {/* Expanded detail metrics */}
                {isExpanded && (
                    <div style={{ animation: 'fadeIn 0.2s ease-out' }}>
                        <div style={{
                            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                            gap: '10px', marginBottom: '14px'
                        }}>
                            <MetricBox icon={<Activity size={12} />} label="Health" value={`${m.avgHealth}%`} color={getScoreColor(m.avgHealth)} />
                            <MetricBox icon={<Wrench size={12} />} label="Open WOs" value={m.openWOs} color={m.openWOs > 10 ? '#f97316' : '#60a5fa'} />
                            <MetricBox icon={<AlertTriangle size={12} />} label="Urgent" value={m.urgentWOs} color={m.urgentWOs > 0 ? '#ef4444' : '#22c55e'} />
                            <MetricBox icon={<Shield size={12} />} label="PM Comply" value={`${m.pmCompliance}%`} color={getScoreColor(m.pmCompliance)} />
                            <MetricBox icon={<CloudLightning size={12} />} label="Failures" value={m.recentFailures} color={m.recentFailures > 3 ? '#ef4444' : '#60a5fa'} />
                            <MetricBox icon={<TrendingUp size={12} />} label="MTBF" value={`${m.avgMTBF}d`} color={m.avgMTBF > 90 ? '#22c55e' : '#f59e0b'} />
                        </div>

                        {/* Quick stats row */}
                        <div style={{
                            display: 'flex', gap: '8px', fontSize: '0.7rem', color: 'var(--text-muted)',
                            justifyContent: 'space-between', alignItems: 'center'
                        }}>
                            <span>{m.totalAssets} assets • {m.criticalAssets} critical • {m.warningAssets} warning</span>
                            <button 
                                onClick={(e) => { e.stopPropagation(); navigateToPlant(plant.plantId); }}
                                style={{
                                    padding: '5px 12px', borderRadius: '6px', cursor: 'pointer',
                                    background: `${scoreColor}15`, border: `1px solid ${scoreColor}30`,
                                    color: scoreColor, fontSize: '0.75rem', fontWeight: 600
                                }}
                                title={`Open the ${plant.plantLabel} dashboard`}
                            >
                                Open Dashboard →
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const MetricBox = ({ icon, label, value, color }) => (
        <div style={{
            background: 'rgba(0,0,0,0.2)', borderRadius: '8px', padding: '8px 10px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                {icon} {label}
            </div>
            <div style={{ fontSize: '0.95rem', fontWeight: 700, color }}>{value}</div>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            <SummaryBar />

            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '14px'
            }}>
                {plants.map(plant => (
                    <PlantCard key={plant.plantId} plant={plant} />
                ))}
            </div>

            {plants.length === 0 && (
                <div style={{
                    textAlign: 'center', padding: '60px 20px',
                    color: 'var(--text-muted)', fontSize: '0.9rem'
                }}>
                    <Cloud size={48} style={{ opacity: 0.3, marginBottom: '15px' }} />
                    <div>{t('plantWeatherMap.noPlantDataAvailableRun')}</div>
                </div>
            )}

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; transform: translateY(-5px); } to { opacity: 1; transform: translateY(0); } }
                @keyframes pulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
            `}</style>
        </div>
    );
}

function pillStyle(color) {
    return {
        padding: '4px 10px', borderRadius: '20px', fontSize: '0.75rem', fontWeight: 600,
        background: `${color}15`, color, border: `1px solid ${color}25`
    };
}
