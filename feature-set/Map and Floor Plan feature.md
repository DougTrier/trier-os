# Trier OS: Map & Floor Plan Intelligence Feature Set

## 🌐 1. High-Performance Geospatial Intelligence (2D/3D Hybrid)
The mapping engine has been rebuilt as a unified "Digital Twin" environment, allowing managers to switch between tactical 2D mapping and full 3rd-person global logistics.

### 🚗 **A. Real-Time Traffic & Logistics Flow**
*   **Feature:** Tactical Road Network & Live Congestion.
*   **How it Works:** Integrated a multi-subdomain Google Traffic engine combined with Stamen's Tactical Infrastructure overlay.
*   **Intelligence:** Visualizes traffic flow in real-time (Green = Clear, Red = Congested) over major Interstates and highways.
*   **Value:** Allows fleet and maintenance dispatchers to route around accidents or weather-related delays.

### 🔎 **B. Precision Geocoding (Tactical Search)**
*   **Feature:** Rooftop-Level Address Search.
*   **How it Works:** Uses OpenStreetMap (Nominatim) geolocalisation. Typing a full address (e.g., `500 W Madison St, Chicago, IL`) and pressing Enter triggers a synchronized "Dive."
*   **2D Map:** Flies directly to the target at **Level 18 Zoom** (Sub-rooftop precision).
*   **3D Globe:** Performs an atmospheric "Sky-Dive" down to **1,000 meters** altitude, centered perfectly on the property.

### 💨 **C. High-Density Rendering Engine**
*   **Feature:** Canvas-Accelerated UI.
*   **How it Works:** The map renderer was shifted from standard SVG to **HTML5 Canvas** (using Leaflet's `preferCanvas`).
*   **Stability:** This allows the system to manage thousands of property pins and intelligence markers simultaneously without CPU lag or interface "choking."

---

## 🏗️ 2. Advanced Floor Plan Editor (Intelligence Overlay)
The Floor Plan system is the bridge between global mapping and granular site management.

### 🛠️ **A. Dynamic Drag-and-Drop Editor**
*   **Feature:** Visual Asset Placement.
*   **How it Works:** A categorized SVG library of machinery, safety equipment, and utilities can be dragged directly onto uploaded plant blueprints.
*   **Customization:** Shift-clicking assets allows for 1° precision rotation and right-side scale adjustments.

### 🛰️ **B. Global-to-Site Link**
*   **Feature:** Direct GPS Link.
*   **How it Works:** Every property pin on the main map is linked to its corresponding Floor Plan database. Clicking a "Plant" pin allows the user to instantly "drill down" into the interior blueprints of that specific facility.

---

## 🌦️ 3. Environmental Hazard Intelligence
Real-time feeds integrated directly into the tactical map to protect physical assets.

### 📡 **A. Stable Weather Radar Loop (Past/Nowcast)**
*   **Feature:** 0-Latency Weather Animation.
*   **How it Works:** Uses the RainViewer API to fetch a loop of the last 2 hours of precipitation and 2 hours of future "Nowcast" prediction.
*   **Stability:** Engineered with a fail-safe fallback system that ensures the map won't error out even if federal weather tiles are delayed.

### 🌋 **B. USGS Seismic Activity Feed**
*   **Feature:** Live Earthquake Tracking.
*   **How it Works:** Connects directly to the USGS Earthquake API. Visualizes recent seismic events globally, with circle markers scaled based on magnitude.

---

## ⚡ Technical Optimization Summary
*   **Built for Production:** All features are pre-compiled via Vite for maximum runtime speed.
*   **Hardened API Proxy:** All external requests (Traffic, Weather, Quakes) are proxied through the Tier OS backend to bypass CORS and centralize security.
*   **Atomic State Management:** Map and Globe stay in perfect lock-step, ensuring the "Digital Twin" never loses orientation.
