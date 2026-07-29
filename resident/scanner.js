// --- Watchtower Scanner Demo Logic ---

// Configuration
const THRESHOLD = 25.00;

// Mock Scenarios Cycle
const mockScans = [
    {
        materials: ["Copper wire", "Aluminum cans", "Small appliances"],
        value: 18.50,
        wtwr: 1850,
        lbs: 12,
        tip: "Strip wire for +15% value."
    },
    {
        materials: ["Cardboard bales", "Mixed plastics"],
        value: 4.20,
        wtwr: 420,
        lbs: 15,
        tip: "Break down boxes to save space."
    },
    {
        materials: ["Landscape lighting wire", "Brass fixtures"],
        value: 12.00,
        wtwr: 1200,
        lbs: 8,
        tip: "Keep brass separate from steel."
    },
    {
        materials: ["Scrap steel", "Electric motor"],
        value: 8.50,
        wtwr: 850,
        lbs: 22,
        tip: "Motors fetch higher node prices."
    }
];

// State Management
let state = {
    currentValue: 0,
    totalWtwr: 0,
    materialsFound: 0,
    impactLbs: 0,
    scanIndex: 0
};

// DOM Elements
const btnScan = document.getElementById('btn-scan');
const btnRequest = document.getElementById('btn-request');
const btnReset = document.getElementById('btn-reset');
const cameraContainer = document.getElementById('camera-container');
const consoleText = document.getElementById('console-text');
const aiOverlay = document.getElementById('ai-overlay');
const overlayTag = document.getElementById('overlay-tag');
const progressBar = document.getElementById('progress-bar-fill');
const bucketPercentage = document.getElementById('bucket-percentage');
const currentValueDisplay = document.getElementById('current-value');
const bountyAlert = document.getElementById('bounty-alert');

const statMaterials = document.getElementById('stat-materials');
const statWtwr = document.getElementById('stat-wtwr');
const statTotalValue = document.getElementById('stat-total-value');
const statImpact = document.getElementById('stat-impact');

// Initialize
function init() {
    const savedState = localStorage.getItem('watchtower_demo_state');
    if (savedState) {
        state = JSON.parse(savedState);
    }
    updateUI();
}

// Save State
function saveState() {
    localStorage.setItem('watchtower_demo_state', JSON.stringify(state));
}

// Update UI
function updateUI() {
    // Update Stats
    statMaterials.textContent = state.materialsFound;
    statWtwr.textContent = state.totalWtwr.toLocaleString();
    statTotalValue.textContent = state.currentValue.toFixed(2);
    statImpact.textContent = state.impactLbs;
    
    currentValueDisplay.textContent = `$${state.currentValue.toFixed(2)}`;

    // Calculate Progress
    let progress = (state.currentValue / THRESHOLD) * 100;
    if (progress > 100) progress = 100;
    
    progressBar.style.width = `${progress}%`;
    bucketPercentage.textContent = `${Math.floor(progress)}%`;

    // Check Threshold
    if (state.currentValue >= THRESHOLD) {
        btnScan.classList.add('hidden');
        bountyAlert.classList.remove('hidden');
        btnRequest.classList.remove('hidden');
        consoleText.style.color = 'var(--wtwr-green)';
        consoleText.textContent = "SYSTEM STATUS: BOUNTY UNLOCKED.\nDRIVER DISPATCH AVAILABLE.";
    } else {
        btnScan.classList.remove('hidden');
        bountyAlert.classList.add('hidden');
        btnRequest.classList.add('hidden');
        consoleText.style.color = 'var(--alert-orange)';
        consoleText.textContent = "SYSTEM READY. AWAITING SCAN INPUT...";
    }
}

// Execute Scan Action
btnScan.addEventListener('click', () => {
    if (btnScan.disabled) return;
    
    // UI Loading State
    btnScan.disabled = true;
    btnScan.textContent = "Scanning...";
    cameraContainer.classList.add('scanning');
    aiOverlay.style.display = 'none';
    consoleText.style.color = 'var(--text-primary)';
    consoleText.textContent = "> INITIALIZING OPTICS...\n> RUNNING NEURAL MATERIAL IDENTIFICATION...";

    // Simulate API Delay
    setTimeout(() => {
        const scanData = mockScans[state.scanIndex];
        
        // Update State
        state.currentValue += scanData.value;
        state.totalWtwr += scanData.wtwr;
        state.materialsFound += scanData.materials.length;
        state.impactLbs += scanData.lbs;
        
        // Cycle Index
        state.scanIndex = (state.scanIndex + 1) % mockScans.length;
        
        saveState();
        
        // Update Visuals
        cameraContainer.classList.remove('scanning');
        aiOverlay.style.display = 'flex';
        overlayTag.textContent = `${scanData.materials[0]} detected`;
        
        // Construct Output
        let output = `> MATERIALS DETECTED:\n`;
        scanData.materials.forEach(m => output += `  - ${m}\n`);
        output += `> EST RECOVERY: $${scanData.value.toFixed(2)}\n`;
        output += `> WTWR EARNED: ${scanData.wtwr}\n`;
        output += `> WTWR TIP: ${scanData.tip}`;
        
        consoleText.style.color = 'var(--wtwr-green)';
        consoleText.textContent = output;
        
        btnScan.textContent = "Execute Optical Scan";
        btnScan.disabled = false;
        
        updateUI();
        
    }, 2000);
});

// Request Driver Action
btnRequest.addEventListener('click', () => {
    btnRequest.disabled = true;
    btnRequest.textContent = "DISPATCHING...";
    
    setTimeout(() => {
        alert("Demo: Driver requested successfully! Material identity transferred to Ocala routing node.");
        // Optional auto-reset for demo flow
        resetDemo();
    }, 1500);
});

// Reset Demo Action
function resetDemo() {
    state = {
        currentValue: 0,
        totalWtwr: 0,
        materialsFound: 0,
        impactLbs: 0,
        scanIndex: 0
    };
    saveState();
    aiOverlay.style.display = 'none';
    btnRequest.disabled = false;
    btnRequest.textContent = "REQUEST DRIVER";
    updateUI();
}

btnReset.addEventListener('click', resetDemo);

// Boot up
init();