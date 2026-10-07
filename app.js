// ==========================================
// CONFIGURACIÓN SUPABASE
// ==========================================
const SUPABASE_URL = 'https://doyzequfqtdjtnldewhh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXplcXVmcXRkanRubGRld2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODA4NTksImV4cCI6MjA5NzA1Njg1OX0.hBE_AwyEfKX1pF0rk2No3loAVAVJ6U6AjusAvjQTQmI';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// ESTADO GLOBAL
// ==========================================
let currentUser = null;
let currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
let timerInterval = null;
let isPaused = true;
let queue = [];
let currentQueueIndex = 0;
let timeLeftInPhase = 0;
let editIndex = -1;
let currentScheduledDay = 'Lunes';
let allHistoryData = [];

// 🆕 WAKE LOCK (Mantener pantalla encendida)
let wakeLock = null;
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock activado: La pantalla no se apagará.');
        }
    } catch (err) {
        console.error('Error Wake Lock:', err);
    }
}
function releaseWakeLock() {
    if (wakeLock !== null) {
        wakeLock.release().then(() => { wakeLock = null; });
    }
}
// Re-adquirir si la pestaña vuelve a estar visible
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

// ==========================================
// INICIALIZACIÓN Y DÍAS
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const equipSelect = document.getElementById('ex-equipment');
    if (equipSelect) equipSelect.addEventListener('change', toggleQuantity);
    const daySelect = document.getElementById('routine-day');
    if (daySelect) daySelect.addEventListener('change', handleDayChange);
    setDefaultDay();
});

function toggleQuantity() {
    const equip = document.getElementById('ex-equipment');
    const qty = document.getElementById('ex-quantity');
    if (!equip || !qty) return;
    qty.disabled = (equip.value === 'Sin equipo');
    if (qty.disabled) qty.value = '2';
}

function setDefaultDay() {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const today = days[new Date().getDay()];
    const daySelect = document.getElementById('routine-day');
    if (daySelect) {
        daySelect.value = today;
        currentScheduledDay = today;
        loadRoutineForDay(today);
    }
}

function handleDayChange() {
    const selectedDay = document.getElementById('routine-day').value;
    if (currentRoutine.exercises.length > 0) {
        if (!confirm(`¿Cargar rutina del ${selectedDay}? Se perderán los cambios actuales.`)) {
            document.getElementById('routine-day').value = currentScheduledDay;
            return;
        }
    }
    currentScheduledDay = selectedDay;
    loadRoutineForDay(selectedDay);
}

function loadRoutineForDay(day) {
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    const routine = allRoutines[day];
    if (routine) {
        currentRoutine = JSON.parse(JSON.stringify(routine));
        renderExerciseList();
        document.getElementById('total-time-display').innerText = formatTime(currentRoutine.totalTime);
        document.getElementById('body-part').value = routine.bodyPart || 'Full Body';
        document.getElementById('rest-ex-global').value = Math.floor((currentRoutine.restBetweenExercises || 0) / 60);
        updateDayInfo(day, true);
    } else {
        currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
        clearFormInputs();
        updateDayInfo(day, false);
    }
}

function updateDayInfo(day, hasRoutine) {
    const info = document.getElementById('routine-day-info');
    if (!info) return;
    info.innerHTML = hasRoutine 
        ? `✅ Rutina programada para <strong>${day}</strong> (${currentRoutine.exercises.length} ejercicios).`
        : `ℹ️ No hay rutina para <strong>${day}</strong>.`;
    info.style.color = hasRoutine ? '#28a745' : '#666';
}

// ==========================================
// 1. AUTENTICACIÓN
// ==========================================
async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return showMessage(error.message, 'auth-message');
    currentUser = data.user;
    initApp();
}

async function register() {
    const name = document.getElementById('user-name').value.trim();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;
    if (!name) return showMessage('⚠️ Ingresa tu nombre.', 'register-message');
    if (password.length < 6) return showMessage('⚠️ Contraseña mín 6 caracteres.', 'register-message');
    if (password !== passwordConfirm) return showMessage('⚠️ Contraseñas no coinciden.', 'register-message');
    
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: name } } });
    if (error) return showMessage('Error: ' + error.message, 'register-message');
    showMessage('✅ ¡Cuenta creada!', 'register-message');
    currentUser = data.user;
    setTimeout(() => initApp(), 1500);
}

async function resetPassword() {
    const email = document.getElementById('login-email').value;
    if (!email) return showMessage('⚠️ Escribe tu correo.', 'auth-message');
    await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    showMessage('✅ Enlace enviado.', 'auth-message');
}

function showMessage(msg, elementId = 'auth-message') {
    const el = document.getElementById(elementId);
    if (el) el.innerText = msg;
}

function initApp() {
    showInterface('programmer-section');
    const userName = currentUser.user_metadata?.full_name || 'Atleta';
    speakRandomGreeting(userName);
}

// ==========================================
// 2. ASISTENTE DE VOZ
// ==========================================
const phrases = ["Bienvenido {name}, listo para sudar ", "Vamos a romperla hoy, {name} ", "El dolor es temporal, {name} "];
const motivationPhrases = ["Adelante, tú puedes ", "No olvides hidratarte ", "Mantén la concentración "];

function speakRandomGreeting(name) {
    const p = phrases[Math.floor(Math.random() * phrases.length)].replace('{name}', name);
    speak(p, 1.1);
}
function getRandomMotivationPhrase() {
    return motivationPhrases[Math.floor(Math.random() * motivationPhrases.length)];
}
function speak(text, rate = 1.1) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'es-ES'; u.rate = rate;
        window.speechSynthesis.speak(u);
    }
}

// ==========================================
// 3. PROGRAMADOR
// ==========================================
function addExercise() {
    const ex = {
        name: document.getElementById('ex-name').value,
        sets: parseInt(document.getElementById('ex-sets').value) || 1,
        reps: parseInt(document.getElementById('ex-reps').value) || 1,
        weight: document.getElementById('ex-weight').value,
        equipment: document.getElementById('ex-equipment').value,
        quantity: parseInt(document.getElementById('ex-quantity').value),
        tempo: {
            ecc: parseInt(document.getElementById('tempo-ecc').value) || 0,
            pb: parseInt(document.getElementById('tempo-pb').value) || 0,
            con: parseInt(document.getElementById('tempo-con').value) || 0,
            pt: parseInt(document.getElementById('tempo-pt').value) || 0
        },
        rest: { set: parseInt(document.getElementById('rest-set').value) || 0 }
    };
    if (!ex.name) return alert('Ingresa un nombre');
    
    if (editIndex >= 0) {
        currentRoutine.exercises[editIndex] = ex;
        editIndex = -1;
        document.querySelector('button[onclick="addExercise()"]').innerText = 'Añadir Ejercicio';
    } else {
        currentRoutine.exercises.push(ex);
    }
    calculateTotalTime();
    renderExerciseList();
    clearExerciseInputs();
}

function clearExerciseInputs() {
    ['ex-name', 'ex-sets', 'ex-reps', 'ex-weight', 'tempo-ecc', 'tempo-pb', 'tempo-con', 'tempo-pt', 'rest-set'].forEach(id => {
        const el = document.getElementById(id); if(el) el.value = '';
    });
    document.getElementById('ex-equipment').value = 'Sin equipo';
    document.getElementById('ex-quantity').value = '2';
    toggleQuantity();
}

function clearFormInputs() {
    clearExerciseInputs();
    document.getElementById('rest-ex-global').value = '';
}

function editExercise(index) {
    const ex = currentRoutine.exercises[index];
    editIndex = index;
    document.getElementById('ex-name').value = ex.name;
    document.getElementById('ex-sets').value = ex.sets;
    document.getElementById('ex-reps').value = ex.reps;
    document.getElementById('ex-weight').value = ex.weight;
    document.getElementById('ex-equipment').value = ex.equipment;
    document.getElementById('ex-quantity').value = ex.quantity;
    document.getElementById('tempo-ecc').value = ex.tempo.ecc;
    document.getElementById('tempo-pb').value = ex.tempo.pb;
    document.getElementById('tempo-con').value = ex.tempo.con;
    document.getElementById('tempo-pt').value = ex.tempo.pt;
    document.getElementById('rest-set').value = ex.rest.set;
    toggleQuantity();
    document.querySelector('button[onclick="addExercise()"]').innerText = 'Guardar Cambios';
    window.scrollTo(0, 0);
}

function deleteExercise(index) {
    currentRoutine.exercises.splice(index, 1);
    editIndex = -1;
    calculateTotalTime();
    renderExerciseList();
}

function calculateTotalTime() {
    let totalSeconds = 40;
    const restExMinutes = parseInt(document.getElementById('rest-ex-global').value) || 0;
    const restExSeconds = restExMinutes * 60;
    
    currentRoutine.exercises.forEach((ex, idx) => {
        const isUnilateral = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        const repCycle = ex.tempo.ecc + ex.tempo.pb + ex.tempo.con + ex.tempo.pt;
        for (let s = 1; s <= ex.sets; s++) {
            if (isUnilateral) {
                totalSeconds += (repCycle * ex.reps) * 2 + 8;
            } else {
                totalSeconds += (repCycle * ex.reps);
            }
            if (s < ex.sets) totalSeconds += ex.rest.set;
        }
        if (idx < currentRoutine.exercises.length - 1) totalSeconds += restExSeconds;
    });
    currentRoutine.totalTime = totalSeconds;
    currentRoutine.restBetweenExercises = restExSeconds;
    document.getElementById('total-time-display').innerText = formatTime(totalSeconds);
}

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return h > 0 ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function renderExerciseList() {
    const list = document.getElementById('exercise-list');
    list.innerHTML = currentRoutine.exercises.map((ex, i) => {
        const isUni = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        const note = isUni ? `(Uni: ${ex.reps}x2)` : '';
        return `<li><strong>${i+1}. ${ex.name}</strong> ${note}<br><small>${ex.sets}x${ex.reps} | ${ex.weight || 'Sin peso'}</small></li>`;
    }).join('');
}

function saveRoutineToStorage() {
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    currentRoutine.restBetweenExercises = (parseInt(document.getElementById('rest-ex-global').value) || 0) * 60;
    allRoutines[currentScheduledDay] = {
        ...JSON.parse(JSON.stringify(currentRoutine)),
        bodyPart: document.getElementById('body-part').value,
        savedAt: new Date().toISOString()
    };
    localStorage.setItem('scheduled_routines', JSON.stringify(allRoutines));
}

function saveRoutineOnly() {
    if (currentRoutine.exercises.length === 0) return alert('Añade ejercicios');
    saveRoutineToStorage();
    updateDayInfo(currentScheduledDay, true);
    alert(`✅ Guardado para ${currentScheduledDay}.`);
}

function saveAndStartRoutine() {
    if (currentRoutine.exercises.length === 0) return alert('Añade ejercicios');
    saveRoutineToStorage();
    localStorage.setItem('pending_routine', JSON.stringify(currentRoutine));
    buildTimerQueue();
    showInterface('executor-section');
    requestWakeLock(); // 🆕 Activar Wake Lock al iniciar
    speak("Dispondrás de 40 segundos para prepararte", 1.1);
}

function showScheduledRoutines() {
    showInterface('scheduled-routines-section');
    renderScheduledRoutines();
}

function renderScheduledRoutines() {
    const container = document.getElementById('scheduled-routines-list');
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    let html = '';
    days.forEach(day => {
        const routine = allRoutines[day];
        const isToday = day === getCurrentDayName();
        const badge = isToday ? ' <span style="background:#C23D55;color:white;padding:2px 8px;border-radius:10px;font-size:11px;">HOY</span>' : '';
        if (routine) {
            html += `<div style="background:${isToday?'#e8f5e9':'#f8f9fa'};padding:15px;border-radius:10px;margin-bottom:10px;border-left:4px solid ${isToday?'#28a745':'#0C047D'};">
                <h3 style="margin:0;color:#0C047D;">${day}${badge}</h3>
                <p style="font-size:13px;margin:5px 0;"><strong>${routine.bodyPart}</strong> | ⏱️ ${formatTime(routine.totalTime)}</p>
                <div style="display:flex;gap:5px;margin-top:10px;">
                    <button onclick="loadAndStartRoutine('${day}')" style="flex:1;padding:8px;background:#28a745;color:white;border:none;border-radius:5px;">▶ Iniciar</button>
                    <button onclick="editScheduledRoutine('${day}')" style="flex:1;padding:8px;background:#ffc107;color:#000;border:none;border-radius:5px;">✏️ Editar</button>
                </div>
            </div>`;
        } else {
            html += `<div style="background:#f8f9fa;padding:15px;border-radius:10px;margin-bottom:10px;opacity:0.7;">
                <h3 style="margin:0;color:#999;">${day}${badge}</h3>
                <button onclick="createRoutineForDay('${day}')" style="width:100%;margin-top:10px;padding:8px;background:#0C047D;color:white;border:none;border-radius:5px;">+ Crear</button>
            </div>`;
        }
    });
    container.innerHTML = html;
}

function getCurrentDayName() {
    return ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date().getDay()];
}

function loadAndStartRoutine(day) {
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    if (!allRoutines[day]) return alert('No hay rutina');
    currentRoutine = JSON.parse(JSON.stringify(allRoutines[day]));
    currentScheduledDay = day;
    saveAndStartRoutine();
}

function editScheduledRoutine(day) {
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    if (!allRoutines[day]) return;
    currentRoutine = JSON.parse(JSON.stringify(allRoutines[day]));
    currentScheduledDay = day;
    document.getElementById('routine-day').value = day;
    document.getElementById('body-part').value = currentRoutine.bodyPart || 'Full Body';
    document.getElementById('rest-ex-global').value = Math.floor((currentRoutine.restBetweenExercises || 0) / 60);
    renderExerciseList();
    document.getElementById('total-time-display').innerText = formatTime(currentRoutine.totalTime);
    updateDayInfo(day, true);
    showInterface('programmer-section');
}

function createRoutineForDay(day) {
    currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
    currentScheduledDay = day;
    document.getElementById('routine-day').value = day;
    clearFormInputs();
    updateDayInfo(day, false);
    showInterface('programmer-section');
}

// ==========================================
// 🆕 3.5 IMPORTACIÓN CSV Y PLAN 12 SEMANAS
// ==========================================
function downloadCSVTemplate() {
    const csvContent = "Semana,Dia,Ejercicio,Series,Reps,Peso,Equipo,Cantidad,Tempo_Ecc,Tempo_PB,Tempo_Con,Tempo_PT,Descanso_Serie,Grupo,Descanso_Global\n1,Lunes,Press Banca,4,8,60kg,Mancuernas,2,3,1,1,1,90,Tren Superior,2\n1,Lunes,Remo,4,8,50kg,Mancuernas,2,3,1,1,1,90,Tren Superior,2";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "plantilla_gym_12semanas.csv");
    link.click();
}

function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const text = e.target.result;
            const rows = text.split(/\r?\n/).filter(r => r.trim() !== '');
            const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
            
            const planData = {}; // { "1": { "Lunes": { exercises: [], bodyPart: "", restGlobal: 0 }, ... }, ... }
            
            for (let i = 1; i < rows.length; i++) {
                const cols = rows[i].split(',').map(c => c.trim());
                if (cols.length < 5) continue;
                
                const rowObj = {};
                headers.forEach((h, idx) => rowObj[h] = cols[idx] || '');
                
                const semana = rowObj.semana || '1';
                const dia = rowObj.dia || 'Lunes';
                
                if (!planData[semana]) planData[semana] = {};
                if (!planData[semana][dia]) {
                    planData[semana][dia] = { exercises: [], bodyPart: rowObj.grupo || 'Full Body', restGlobal: parseInt(rowObj.descanso_global) || 0 };
                }
                
                planData[semana][dia].exercises.push({
                    name: rowObj.ejercicio,
                    sets: parseInt(rowObj.series) || 1,
                    reps: parseInt(rowObj.reps) || 1,
                    weight: rowObj.peso || '',
                    equipment: rowObj.equipo || 'Sin equipo',
                    quantity: parseInt(rowObj.cantidad) || 2,
                    tempo: {
                        ecc: parseInt(rowObj.tempo_ecc) || 0,
                        pb: parseInt(rowObj.tempo_pb) || 0,
                        con: parseInt(rowObj.tempo_con) || 0,
                        pt: parseInt(rowObj.tempo_pt) || 0
                    },
                    rest: { set: parseInt(rowObj.descanso_serie) || 0 }
                });
            }
            
            localStorage.setItem('12_week_plan', JSON.stringify(planData));
            
            // Cargar la Semana 1 en las rutinas actuales para que la app funcione de inmediato
            if (planData['1']) {
                const currentRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
                Object.keys(planData['1']).forEach(day => {
                    const r = planData['1'][day];
                    let totalSec = 40;
                    r.exercises.forEach((ex, idx) => {
                        const isUni = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
                        const cycle = ex.tempo.ecc + ex.tempo.pb + ex.tempo.con + ex.tempo.pt;
                        for(let s=1; s<=ex.sets; s++) {
                            totalSec += isUni ? (cycle * ex.reps)*2 + 8 : (cycle * ex.reps);
                            if(s < ex.sets) totalSec += ex.rest.set;
                        }
                        if(idx < r.exercises.length - 1) totalSec += r.restGlobal * 60;
                    });
                    currentRoutines[day] = { ...r, totalTime: totalSec, restBetweenExercises: r.restGlobal * 60 };
                });
                localStorage.setItem('scheduled_routines', JSON.stringify(currentRoutines));
            }
            
            alert('✅ Plan de 12 semanas importado con éxito. La Semana 1 ya está activa en "Mis Rutinas".');
            showScheduledRoutines();
        } catch (err) {
            alert('❌ Error al leer el CSV. Asegúrate de usar la plantilla correcta.');
            console.error(err);
        }
    };
    reader.readAsText(file);
}

function show12WeekPlan() {
    showInterface('twelve-week-section');
    const planData = JSON.parse(localStorage.getItem('12_week_plan') || '{}');
    const container = document.getElementById('twelve-week-content');
    
    if (Object.keys(planData).length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#999;">No hay ningún plan importado.</p>';
        return;
    }
    
    // Calcular fechas basadas en hoy como inicio de la Semana 1
    const startDate = new Date();
    startDate.setHours(0,0,0,0);
    const daysMap = { 'Lunes': 1, 'Martes': 2, 'Miércoles': 3, 'Jueves': 4, 'Viernes': 5, 'Sábado': 6, 'Domingo': 0 };
    
    let html = '';
    const weeks = Object.keys(planData).sort((a,b) => parseInt(a) - parseInt(b));
    
    weeks.forEach(weekNum => {
        const weekOffset = parseInt(weekNum) - 1;
        html += `<div style="margin-bottom:20px; border: 1px solid #ddd; border-radius: 10px; overflow: hidden;">
            <div style="background: #0C047D; color: white; padding: 10px; font-weight: bold;">Semana ${weekNum}</div>
            <div style="padding: 10px;">`;
            
        const days = planData[weekNum];
        Object.keys(days).forEach(dayName => {
            const routine = days[dayName];
            // Calcular fecha exacta
            const dayIndex = daysMap[dayName];
            const currentDayIndex = startDate.getDay();
            let daysToAdd = (dayIndex - currentDayIndex + 7) % 7;
            if (weekOffset > 0 || daysToAdd === 0) daysToAdd += (weekOffset * 7);
            const exactDate = new Date(startDate);
            exactDate.setDate(startDate.getDate() + daysToAdd);
            const dateStr = exactDate.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
            
            const exNames = routine.exercises.map(e => e.name).join(', ');
            html += `<div style="background: #f8f9fa; padding: 10px; border-radius: 8px; margin-bottom: 8px; border-left: 4px solid #C23D55;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <strong>${dayName}</strong> <span style="font-size: 12px; color: #666;">📅 ${dateStr}</span>
                </div>
                <p style="font-size: 12px; color: #555; margin: 5px 0 0 0;">${routine.bodyPart} | ${routine.exercises.length} ej: <small>${exNames}</small></p>
            </div>`;
        });
        html += `</div></div>`;
    });
    
    container.innerHTML = html;
}

// ==========================================
// 4. EJECUTOR (CRONOMETRAJE Y AUDIO)
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    
    if (type === 'metronome') { osc.type = 'square'; osc.frequency.setValueAtTime(1000, now); gain.gain.setValueAtTime(0.3, now); osc.start(now); osc.stop(now + 0.05); }
    else if (type === 'eccentric') { osc.type = 'sine'; osc.frequency.setValueAtTime(250, now); gain.gain.setValueAtTime(0.5, now); osc.start(now); osc.stop(now + 0.8); }
    else if (type === 'concentric') { osc.type = 'sine'; osc.frequency.setValueAtTime(900, now); gain.gain.setValueAtTime(0.5, now); osc.start(now); osc.stop(now + 0.8); }
    else if (type === 'pause-bottom' || type === 'pause-top') { osc.type = 'sine'; osc.frequency.setValueAtTime(600, now); gain.gain.setValueAtTime(0.3, now); osc.start(now); osc.stop(now + 0.1); }
    else if (type === 'transition') { osc.type = 'sine'; osc.frequency.setValueAtTime(400, now); gain.gain.setValueAtTime(0.4, now); osc.start(now); osc.stop(now + 0.3); }
}

function buildTimerQueue() {
    queue = [];
    queue.push({ phase: 'Preparación', duration: 40, action: 'prep' });
    const restExSeconds = currentRoutine.restBetweenExercises || 0;
    
    currentRoutine.exercises.forEach((ex, exIndex) => {
        const isUnilateral = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        const nextExName = currentRoutine.exercises[exIndex + 1] ? currentRoutine.exercises[exIndex + 1].name : "el final";
        
        for (let s = 1; s <= ex.sets; s++) {
            for (let r = 1; r <= ex.reps; r++) {
                const phases = [];
                if (ex.tempo.ecc > 0) phases.push({ phase: 'Excéntrico', duration: ex.tempo.ecc, action: 'ecc' });
                if (ex.tempo.pb > 0) phases.push({ phase: 'Pausa Abajo', duration: ex.tempo.pb, action: 'pause-bottom' });
                if (ex.tempo.con > 0) phases.push({ phase: 'Concéntrico', duration: ex.tempo.con, action: 'con' });
                if (ex.tempo.pt > 0) phases.push({ phase: 'Pausa Arriba', duration: ex.tempo.pt, action: 'pause-top' });
                
                phases.forEach((p, idx) => {
                    queue.push({ ...p, exerciseName: ex.name, setNumber: s, repNumber: r, totalReps: ex.reps, totalSets: ex.sets, sideLabel: isUnilateral ? "Izquierda" : "", isUnilateral: isUnilateral, isFirstPhaseOfRep: (idx === 0) });
                });
            }
            if (isUnilateral) {
                queue.push({ phase: 'Transición', duration: 8, action: 'rest-trans', nextSide: "Derecha", isUnilateral: true });
                for (let r = 1; r <= ex.reps; r++) {
                    const phases = [];
                    if (ex.tempo.ecc > 0) phases.push({ phase: 'Excéntrico', duration: ex.tempo.ecc, action: 'ecc' });
                    if (ex.tempo.pb > 0) phases.push({ phase: 'Pausa Abajo', duration: ex.tempo.pb, action: 'pause-bottom' });
                    if (ex.tempo.con > 0) phases.push({ phase: 'Concéntrico', duration: ex.tempo.con, action: 'con' });
                    if (ex.tempo.pt > 0) phases.push({ phase: 'Pausa Arriba', duration: ex.tempo.pt, action: 'pause-top' });
                    phases.forEach((p, idx) => {
                        queue.push({ ...p, exerciseName: ex.name, setNumber: s, repNumber: r, totalReps: ex.reps, totalSets: ex.sets, sideLabel: "Derecha", isUnilateral: true, isFirstPhaseOfRep: (idx === 0) });
                    });
                }
            }
            if (s < ex.sets) queue.push({ phase: 'Descanso', duration: ex.rest.set, action: 'rest' });
        }
        if (exIndex < currentRoutine.exercises.length - 1 && restExSeconds > 0) {
            queue.push({ phase: 'Descanso Ejercicio', duration: restExSeconds, action: 'rest-exercise', nextExName: nextExName });
        }
    });
    queue.push({ phase: '¡Finalizado!', duration: 5, action: 'finish' });
    currentQueueIndex = 0;
    loadNextPhase();
}

function loadNextPhase() {
    if (currentQueueIndex >= queue.length) return;
    const item = queue[currentQueueIndex];
    timeLeftInPhase = item.duration;
    updateTimerUI(item);
    
    if (item.action === 'prep' && timeLeftInPhase === 40) speak("Comienza la preparación", 1.1);
    else if (item.action === 'ecc' && item.isFirstPhaseOfRep) { speak(item.isUnilateral ? item.sideLabel + " excen" : "excen", 1.3); playSound('eccentric'); }
    else if (item.action === 'con') { speak("concex", 1.3); playSound('concentric'); }
    else if (item.action === 'pause-bottom' || item.action === 'pause-top') { speak("pausa", 1.3); playSound(item.action); }
    else if (item.action === 'rest-exercise') { speak(`Siguiente: ${item.nextExName}`, 1.2); playSound('transition'); }
    else if (item.action === 'rest') { speak("Descanso", 1.2); }
    else if (item.action === 'finish') {
        speak("Felicidades, has completado tu rutina", 1.1);
        saveHistory();
        clearRoutine();
        releaseWakeLock(); // 🆕 Liberar Wake Lock al terminar
        setTimeout(() => showInterface('history-section'), 3000);
        return;
    }
}

function updateTimerUI(item) {
    let title = item.exerciseName || item.phase;
    if (item.exerciseName) {
        title += ` - S${item.setNumber}/${item.totalSets}`;
        if (item.isUnilateral && item.sideLabel) title += ` - ${item.sideLabel}`;
        title += ` - R${item.repNumber}/${item.totalReps}`;
    }
    document.getElementById('current-phase-title').innerText = title;
    document.getElementById('timer-seconds').innerText = timeLeftInPhase;
    
    const circle = document.querySelector('.progress-ring__circle');
    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference - (timeLeftInPhase / item.duration) * circumference;
}

function tick() {
    if (isPaused) return;
    const currentItem = queue[currentQueueIndex];
    const isRest = (currentItem.action === 'prep' || currentItem.action === 'rest' || currentItem.action === 'rest-trans' || currentItem.action === 'rest-exercise');
    
    if (isRest) {
        if (timeLeftInPhase === 20) speak("20 segundos", 1.2);
        if (timeLeftInPhase <= 3 && timeLeftInPhase > 0) speak(timeLeftInPhase.toString(), 1.2);
    }
    if (currentItem.action === 'rest-trans' && timeLeftInPhase === 7) speak("Cambiar a " + currentItem.nextSide, 1.3);
    
    timeLeftInPhase--;
    updateTimerUI(currentItem);
    
    if (timeLeftInPhase <= 0) {
        currentQueueIndex++;
        if (currentQueueIndex < queue.length) loadNextPhase();
        else { clearInterval(timerInterval); finishRoutine(); }
    }
}

function toggleTimer() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    isPaused = !isPaused;
    document.getElementById('btn-start-pause').innerText = isPaused ? 'Reanudar' : 'Pausar';
    if (!isPaused) {
        timerInterval = setInterval(tick, 1000);
        requestWakeLock(); // Asegurar Wake Lock al reanudar
    } else {
        clearInterval(timerInterval);
    }
}

function finishRoutine() {
    clearInterval(timerInterval);
    speak("Rutina finalizada", 1.1);
    saveHistory();
    clearRoutine();
    releaseWakeLock(); // 🆕 Liberar Wake Lock
    showInterface('history-section');
}

function pauseAndExit() {
    if (!confirm('¿Pausar y salir? La pantalla volverá a apagarse normalmente.')) return;
    clearInterval(timerInterval);
    isPaused = true;
    releaseWakeLock(); // 🆕 Liberar Wake Lock al salir
    showInterface('programmer-section');
}

function clearRoutine() {
    currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
    editIndex = -1;
    clearFormInputs();
    document.getElementById('total-time-display').innerText = '00:00';
    document.getElementById('exercise-list').innerHTML = '';
}

// ==========================================
// 5. HISTORIAL
// ==========================================
async function saveHistory() {
    const record = {
        user_id: currentUser ? currentUser.id : 'guest',
        date: new Date().toISOString().split('T')[0],
        body_part: document.getElementById('body-part').value,
        day: currentScheduledDay,
        exercises: currentRoutine.exercises,
        total_time: currentRoutine.totalTime
    };
    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    history.push(record);
    localStorage.setItem('gym_history', JSON.stringify(history));
    if (navigator.onLine && currentUser) await supabaseClient.from('routines').insert(record);
}

async function loadHistory() {
    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    if (navigator.onLine && currentUser) {
        const { data } = await supabaseClient.from('routines').select('*').eq('user_id', currentUser.id);
        if (data) history = [...data, ...history];
    }
    history.sort((a, b) => new Date(b.date) - new Date(a.date));
    allHistoryData = history;
    renderHistoryStats(history);
    applyHistoryFilters();
}

function renderHistoryStats(history) {
    const total = history.length;
    const time = history.reduce((s, r) => s + (r.total_time || 0), 0);
    document.getElementById('history-stats').innerHTML = `
        <div class="stats-grid">
            <div class="stat-card"><div class="stat-icon">🏋️</div><div class="stat-value">${total}</div><div class="stat-label">Rutinas</div></div>
            <div class="stat-card"><div class="stat-icon">⏱️</div><div class="stat-value">${formatTime(time)}</div><div class="stat-label">Tiempo</div></div>
        </div>`;
}

function applyHistoryFilters() {
    const search = document.getElementById('history-search').value.toLowerCase();
    let filtered = allHistoryData.filter(item => !search || item.exercises.some(e => e.name.toLowerCase().includes(search)));
    renderHistoryList(filtered);
}

function renderHistoryList(history) {
    const container = document.getElementById('history-list');
    if (history.length === 0) return container.innerHTML = '<p style="text-align:center;color:#999;">Sin registros.</p>';
    container.innerHTML = history.map((item, i) => `
        <div class="history-item">
            <h3 style="margin:0;color:#0C047D;">${item.date} - ${item.day}</h3>
            <p style="font-size:13px;margin:5px 0;">${item.body_part} | ⏱️ ${formatTime(item.total_time)}</p>
            <p style="font-size:12px;color:#666;">${item.exercises.map(e=>e.name).join(', ')}</p>
        </div>`).join('');
}

// ==========================================
// 6. UTILIDADES
// ==========================================
function showInterface(id) {
    document.querySelectorAll('.interface').forEach(el => el.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if (id === 'history-section') loadHistory();
}
