// ==========================================
// 🆕 PLUGIN NATIVO DE VOZ (CAPACITOR)
// Acceso vía window.Capacitor.Plugins (sin bundler)
// ==========================================
let TTSPlugin = null;
let ttsReady = false;

try {
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.TextToSpeech) {
        TTSPlugin = window.Capacitor.Plugins.TextToSpeech;
        ttsReady = true;
        console.log('✅ Plugin TTS nativo cargado vía Capacitor.Plugins');
    } else {
        console.warn('⚠️ Plugin TTS no registrado. Usando fallback web.');
    }
} catch (e) {
    console.warn('⚠️ Error cargando plugin TTS:', e);
}

// ==========================================
// CONFIGURACIÓN SUPABASE
// ==========================================
const SUPABASE_URL = 'https://doyzequfqtdjtnldewhh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRveXplcXVmcXRkanRubGRld2hoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODA4NTksImV4cCI6MjA5NzA1Njg1OX0.hBE_AwyEfKX1pF0rk2No3loAVAVJ6U6AjusAvjQTQmI';
let supabaseClient = null;

try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('✅ Supabase inicializado correctamente');
    } else {
        console.error('❌ La librería de Supabase no está cargada. Verifica el CDN en index.html');
    }
} catch (e) {
    console.error(' Error al inicializar Supabase:', e);
}

// ==========================================
// ESTADO GLOBAL & WAKE LOCK
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
let wakeLock = null;

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('🔒 Pantalla mantenida encendida.');
        }
    } catch (err) { console.error('Error Wake Lock:', err); }
}

function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().then(() => { wakeLock = null; }); }
}

document.addEventListener('visibilitychange', async () => {
    if (wakeLock && document.visibilityState === 'visible') await requestWakeLock();
});

// ==========================================
// INICIALIZACIÓN
// ==========================================
function toggleQuantity() {
    const equip = document.getElementById('ex-equipment');
    const qty = document.getElementById('ex-quantity');
    if (!equip || !qty) return;
    if (equip.value === 'Sin equipo') { qty.disabled = true; qty.value = '2'; }
    else { qty.disabled = false; }
}

document.addEventListener('DOMContentLoaded', () => {
    const equipSelect = document.getElementById('ex-equipment');
    if (equipSelect) { equipSelect.addEventListener('change', toggleQuantity); toggleQuantity(); }
    const daySelect = document.getElementById('routine-day');
    if (daySelect) { daySelect.addEventListener('change', handleDayChange); setDefaultDay(); }
});

function setDefaultDay() {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const today = days[new Date().getDay()];
    const daySelect = document.getElementById('routine-day');
    if (daySelect) { daySelect.value = today; currentScheduledDay = today; loadRoutineForDay(today); }
}

function handleDayChange() {
    const selectedDay = document.getElementById('routine-day').value;
    if (currentRoutine.exercises.length > 0) {
        if (!confirm(`Tienes una rutina en edición. ¿Cargar la del ${selectedDay}?`)) {
            document.getElementById('routine-day').value = currentScheduledDay; return;
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
    if (hasRoutine) {
        info.innerHTML = `✅ Ya tienes una rutina programada para <strong>${day}</strong> con ${currentRoutine.exercises.length} ejercicio(s).`;
        info.style.color = '#28a745';
    } else {
        info.innerHTML = `ℹ️ No hay rutina programada para <strong>${day}</strong>. Crea una nueva.`;
        info.style.color = '#666';
    }
}

// ==========================================
// 1. AUTENTICACIÓN
// ==========================================
async function login() {
    if (!supabaseClient) return alert('❌ Error: Supabase no está conectado. Recarga la página.');
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return showMessage(error.message, 'auth-message');
    currentUser = data.user;
    initApp();
}

async function register() {
    if (!supabaseClient) return alert('❌ Error: Supabase no está conectado.');
    const name = document.getElementById('user-name').value.trim();
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    const passwordConfirm = document.getElementById('register-password-confirm').value;
    if (!name) return showMessage('⚠️ Ingresa tu nombre.', 'register-message');
    if (!email || !password) return showMessage('⚠️ Completa todos los campos.', 'register-message');
    if (password.length < 6) return showMessage('️ Contraseña mín 6 caracteres.', 'register-message');
    if (password !== passwordConfirm) return showMessage('⚠️ Contraseñas no coinciden.', 'register-message');
    showMessage('Creando cuenta...', 'register-message');
    const { data, error } = await supabaseClient.auth.signUp({ email, password, options: { data: { full_name: name } } });
    if (error) return showMessage('Error: ' + error.message, 'register-message');
    showMessage('✅ ¡Cuenta creada! Redirigiendo...', 'register-message');
    currentUser = data.user;
    setTimeout(() => initApp(), 1500);
}

async function resetPassword() {
    if (!supabaseClient) return alert('❌ Error: Supabase no está conectado.');
    const email = document.getElementById('login-email').value;
    if (!email) return showMessage('⚠️ Escribe tu correo.', 'auth-message');
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) showMessage('Error: ' + error.message, 'auth-message');
    else showMessage('✅ Enlace enviado a tu correo.', 'auth-message');
}

function showMessage(msg, elementId = 'auth-message') {
    const el = document.getElementById(elementId);
    if (el) el.innerText = msg;
}

async function initApp() {
    showInterface('programmer-section');
    const userName = currentUser.user_metadata?.full_name || (currentUser.email ? currentUser.email.split('@')[0] : 'Atleta');
    speakRandomGreeting(userName);

    if (navigator.onLine && supabaseClient) {
        try {
            const loaded = await loadPlanFromCloud();
            if (loaded) {
                console.log('✅ Plan descargado de la nube al iniciar');
                loadRoutineForDay(currentScheduledDay);
            }
        } catch (e) {
            console.error('Error al sincronizar al iniciar:', e);
        }
    }
}

// ==========================================
// 🆕 SINCRONIZACIÓN EN LA NUBE
// ==========================================
async function syncPlanToCloud() {
    if (!currentUser || !supabaseClient || !navigator.onLine) {
        console.log('⚠️ Sincronización omitida');
        return false;
    }
    try {
        const plan12 = localStorage.getItem('12_week_plan') || '{}';
        const scheduled = localStorage.getItem('scheduled_routines') || '{}';
        const { error } = await supabaseClient.from('user_plans').upsert({
            user_id: currentUser.id,
            plan_12_weeks: JSON.parse(plan12),
            scheduled_routines: JSON.parse(scheduled),
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });
        if (error) {
            console.error('❌ Error al subir a la nube:', error);
            return false;
        }
        console.log('✅ Plan subido a la nube correctamente');
        return true;
    } catch (e) {
        console.error("Error sync cloud:", e);
        return false;
    }
}

async function loadPlanFromCloud() {
    if (!currentUser || !supabaseClient || !navigator.onLine) return false;
    try {
        const { data, error } = await supabaseClient.from('user_plans')
            .select('*')
            .eq('user_id', currentUser.id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                console.log('ℹ️ No hay plan en la nube para este usuario');
                return false;
            }
            console.error('❌ Error al cargar desde la nube:', error);
            return false;
        }

        if (data) {
            const localScheduled = localStorage.getItem('scheduled_routines');
            const cloudData = JSON.stringify(data.scheduled_routines || {});
            const localData = localScheduled || '{}';

            if (localData !== cloudData) {
                const hasLocalData = localScheduled && localScheduled !== '{}';
                let shouldOverwrite = true;

                if (hasLocalData) {
                    shouldOverwrite = confirm(
                        '🔄 Se encontraron rutinas diferentes en la nube.\n\n' +
                        '¿Deseas descargar las rutinas de la nube?\n' +
                        '(Se reemplazarán las rutinas locales actuales)'
                    );
                }

                if (shouldOverwrite) {
                    localStorage.setItem('12_week_plan', JSON.stringify(data.plan_12_weeks || {}));
                    localStorage.setItem('scheduled_routines', JSON.stringify(data.scheduled_routines || {}));
                    console.log('✅ Plan descargado desde la nube');
                    loadRoutineForDay(currentScheduledDay);
                    return true;
                }
            } else {
                console.log('✅ Los datos locales y de la nube están sincronizados');
            }
        }
        return false;
    } catch (e) {
        console.error("Error load cloud:", e);
        return false;
    }
}

async function syncNow() {
    if (!currentUser) { alert('⚠️ Inicia sesión primero.'); return; }
    if (!navigator.onLine) { alert('⚠️ No hay conexión a internet.'); return; }
    if (!supabaseClient) { alert('❌ Supabase no está disponible.'); return; }
    try {
        const success = await syncPlanToCloud();
        if (success) {
            alert('✅ Sincronización completada.');
        } else {
            alert('⚠️ No se pudo sincronizar.');
        }
    } catch (e) {
        alert('❌ Error al sincronizar: ' + e.message);
    }
}

// ==========================================
// 2. ASISTENTE DE VOZ (PLUGIN NATIVO + FALLBACK WEB)
// ==========================================
const phrases = [
    "Bienvenido {name}, listo para sudar", "Vamos a romperla hoy, {name}",
    "El dolor es temporal, la gloria es eterna, {name}", "A darle con todo, {name}",
    "Tu único límite eres tú, {name}", "Hoy se construye el cuerpo del mañana, {name}",
    "No pares hasta estar orgulloso, {name}", "La disciplina vence al talento, {name}",
    "Suda ahora, brilla después, {name}", "Cada repetición cuenta, {name}",
    "Haz que cada segundo valga, {name}", "Tu cuerpo puede, convence a tu mente, {name}",
    "A entrenar se ha dicho, {name}", "Sin excusas, solo resultados, {name}",
    "La magia sucede fuera de tu zona de confort, {name}", "Convierte el dolor en poder, {name}",
    "Hoy es un buen día para ser fuerte, {name}", "El éxito es la suma de pequeños esfuerzos, {name}",
    "No cuentes los días, haz que los días cuenten, {name}", "Tu futuro te está esperando, {name}",
    "Dale duro, {name}", "La consistencia es la clave, {name}",
    "Supera tus límites, {name}", "Vamos a esculpir esa obra de arte, {name}"
];

const motivationPhrases = [
    "Adelante, tú puedes", "No olvides hidratarte", "Mantén la concentración",
    "Cada repetición te hace más fuerte", "El esfuerzo de hoy es el éxito de mañana",
    "Respira hondo y sigue", "Tu cuerpo es capaz de más de lo que imaginas",
    "No te rindas, estás cerca", "La constancia es tu mejor aliada",
    "Siente el poder de tu esfuerzo", "Un paso a la vez, sigue adelante",
    "Tu disciplina construye tu futuro", "Confía en el proceso",
    "Eres más fuerte de lo que crees", "El sacrificio de hoy es la victoria de mañana",
    "Sigue empujando, el resultado vale la pena"
];

function speakRandomGreeting(name) {
    const randomPhrase = phrases[Math.floor(Math.random() * phrases.length)].replace('{name}', name);
    speak(randomPhrase, 1.1);
}

function getRandomMotivationPhrase() {
    return motivationPhrases[Math.floor(Math.random() * motivationPhrases.length)];
}

//  FUNCIÓN speak CON PLUGIN NATIVO + FALLBACK WEB
async function speak(text, rate = 1.1) {
    // 🥇 PRIORIDAD 1: Plugin nativo de Capacitor
    if (ttsReady && TTSPlugin) {
        try {
            await TTSPlugin.speak({
                text: text,
                lang: 'es-ES',
                rate: rate,
                pitch: 1.0,
                volume: 1.0
            });
            console.log('🗣️ [NATIVO] Voz:', text.substring(0, 40));
            return;
        } catch (e) {
            console.warn('⚠️ Plugin nativo falló, usando fallback web:', e);
        }
    }

    //  PRIORIDAD 2: Fallback a Web Speech API
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'es';
        utterance.rate = rate;
        utterance.volume = 1.0;

        const voices = window.speechSynthesis.getVoices();
        const spanishVoice = voices.find(v => v.lang.startsWith('es'));
        if (spanishVoice) {
            utterance.voice = spanishVoice;
        }

        setTimeout(() => {
            window.speechSynthesis.speak(utterance);
        }, 100);
        console.log('🗣️ [WEB] Voz:', text.substring(0, 40));
    } else {
        console.warn('⚠️ Ningún sistema de voz disponible');
    }
}

// ==========================================
// 🆕 PRESETS DE TEMPO
// ==========================================
function applyTempoPreset(ecc, pb, con, pt) {
    document.getElementById('tempo-ecc').value = ecc;
    document.getElementById('tempo-pb').value = pb;
    document.getElementById('tempo-con').value = con;
    document.getElementById('tempo-pt').value = pt;
}

// ==========================================
// 3. PROGRAMADOR DE RUTINAS
// ==========================================
function addExercise() {
    const nameEl = document.getElementById('ex-name');
    const qtyEl = document.getElementById('ex-quantity');
    if (!nameEl || !qtyEl) return alert("⚠️ Error de carga. Recarga la página.");

    let conInput = document.getElementById('tempo-con').value.trim().toUpperCase();
    let isExplosive = (conInput === 'X');
    let conVal = isExplosive ? 1 : (parseInt(conInput) || 0);

    const ex = {
        name: nameEl.value,
        sets: parseInt(document.getElementById('ex-sets').value) || 1,
        reps: parseInt(document.getElementById('ex-reps').value) || 1,
        weight: document.getElementById('ex-weight').value,
        equipment: document.getElementById('ex-equipment').value,
        quantity: parseInt(qtyEl.value),
        tempo: {
            ecc: parseInt(document.getElementById('tempo-ecc').value) || 0,
            pb: parseInt(document.getElementById('tempo-pb').value) || 0,
            con: conVal,
            pt: parseInt(document.getElementById('tempo-pt').value) || 0,
            isExplosive: isExplosive
        },
        rest: { set: parseInt(document.getElementById('rest-set').value) || 0 }
    };

    if (!ex.name) return alert('Ingresa un nombre de ejercicio');

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
    ['ex-name','ex-sets','ex-reps','ex-weight','tempo-ecc','tempo-pb','tempo-con','tempo-pt','rest-set'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
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
    document.getElementById('tempo-con').value = ex.tempo.isExplosive ? 'X' : ex.tempo.con;
    document.getElementById('tempo-pt').value = ex.tempo.pt;
    document.getElementById('rest-set').value = ex.rest.set;
    toggleQuantity();
    document.querySelector('button[onclick="addExercise()"]').innerText = 'Guardar Cambios';
    window.scrollTo(0, 0);
}

function deleteExercise(index) {
    currentRoutine.exercises.splice(index, 1);
    editIndex = -1;
    document.querySelector('button[onclick="addExercise()"]').innerText = 'Añadir Ejercicio';
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
        const isUnilateral = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        const note = isUnilateral ? `(${ex.reps} Izq → 8s → ${ex.reps} Der) x${ex.sets}` : '';
        const conDisplay = ex.tempo.isExplosive ? 'X' : ex.tempo.con;
        return `<li style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #ddd;"> <div><strong>${i+1}. ${ex.name}</strong> ${note}<br> <small>${ex.sets}x${ex.reps} | ${ex.weight||'Sin peso'} | Tempo: ${ex.tempo.ecc}-${ex.tempo.pb}-${conDisplay}-${ex.tempo.pt}</small></div> <div> <button onclick="editExercise(${i})" style="width:auto;padding:5px 10px;font-size:12px;margin:0 5px;background:#ffc107;color:#000;border:none;border-radius:5px;cursor:pointer;">✏️</button> <button onclick="deleteExercise(${i})" style="width:auto;padding:5px 10px;font-size:12px;margin:0;background:#ff4444;color:#fff;border:none;border-radius:5px;cursor:pointer;">🗑️</button> </div></li>`;
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
    syncPlanToCloud().catch(e => console.error('Sync falló:', e));
}

function saveRoutineOnly() {
    if (currentRoutine.exercises.length === 0) return alert('Añade al menos un ejercicio');
    saveRoutineToStorage();
    updateDayInfo(currentScheduledDay, true);
    alert(`✅ Rutina guardada para el ${currentScheduledDay}.`);
}

function saveAndStartRoutine() {
    if (currentRoutine.exercises.length === 0) return alert('Añade al menos un ejercicio');
    saveRoutineToStorage();
    buildTimerQueue();
    showInterface('executor-section');
    requestWakeLock();
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
        const todayBadge = isToday ? ' <span style="background:#C23D55;color:white;padding:2px 8px;border-radius:10px;font-size:11px;">HOY</span>' : '';

        if (routine) {
            const exercisesList = routine.exercises.map(e => e.name).join(', ');
            html += `<div style="background:${isToday?'#e8f5e9':'#f8f9fa'};padding:15px;border-radius:10px;margin-bottom:10px;border-left:4px solid ${isToday?'#28a745':'#0C047D'};"> <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:5px;"> <h3 style="margin:0;color:#0C047D;">${day}${todayBadge}</h3> <div style="display:flex;gap:5px;"> <button onclick="loadAndStartRoutine('${day}')" style="padding:5px 10px;font-size:12px;background:#28a745;color:white;border:none;border-radius:5px;cursor:pointer;">▶</button> <button onclick="editScheduledRoutine('${day}')" style="padding:5px 10px;font-size:12px;background:#ffc107;color:#000;border:none;border-radius:5px;cursor:pointer;">✏️</button> <button onclick="deleteScheduledRoutine('${day}')" style="padding:5px 10px;font-size:12px;background:#ff4444;color:white;border:none;border-radius:5px;cursor:pointer;">🗑️</button> </div> </div> <p style="margin:5px 0;font-size:13px;"><strong>${routine.bodyPart||'Full Body'}</strong> | ⏱️ ${formatTime(routine.totalTime)}</p> <p style="margin:5px 0;font-size:12px;color:#888;"><small>${exercisesList}</small></p> </div>`;
        } else {
            html += `<div style="background:#f8f9fa;padding:15px;border-radius:10px;margin-bottom:10px;border-left:4px solid #ccc;opacity:0.7;"> <div style="display:flex;justify-content:space-between;align-items:center;"> <h3 style="margin:0;color:#999;">${day}${todayBadge}</h3> <button onclick="createRoutineForDay('${day}')" style="padding:5px 12px;font-size:12px;background:#0C047D;color:white;border:none;border-radius:5px;cursor:pointer;">+ Crear</button> </div> <p style="margin:5px 0;font-size:12px;color:#999;">Sin rutina programada</p> </div>`;
        }
    });
    container.innerHTML = html;
}

function getCurrentDayName() {
    return ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'][new Date().getDay()];
}

function loadAndStartRoutine(day) {
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    const routine = allRoutines[day];
    if (!routine) return alert('No hay rutina para este día');
    currentRoutine = JSON.parse(JSON.stringify(routine));
    currentScheduledDay = day;
    document.getElementById('routine-day').value = day;
    document.getElementById('body-part').value = routine.bodyPart || 'Full Body';
    saveAndStartRoutine();
}

function editScheduledRoutine(day) {
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    const routine = allRoutines[day];
    if (!routine) return;
    currentRoutine = JSON.parse(JSON.stringify(routine));
    currentScheduledDay = day;
    document.getElementById('routine-day').value = day;
    document.getElementById('body-part').value = routine.bodyPart || 'Full Body';
    document.getElementById('rest-ex-global').value = Math.floor((routine.restBetweenExercises || 0) / 60);
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

function deleteScheduledRoutine(day) {
    if (!confirm(`¿Eliminar la rutina del ${day}?`)) return;
    const allRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
    delete allRoutines[day];
    localStorage.setItem('scheduled_routines', JSON.stringify(allRoutines));
    syncPlanToCloud();
    if (day === currentScheduledDay) {
        currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
        clearFormInputs();
        document.getElementById('total-time-display').innerText = '00:00';
        document.getElementById('exercise-list').innerHTML = '';
        updateDayInfo(day, false);
    }
    renderScheduledRoutines();
}

// ==========================================
// 🆕 IMPORTACIÓN CSV Y PLAN 12 SEMANAS
// ==========================================
function downloadCSVTemplate() {
    const csv = "Semana,Dia,Ejercicio,Series,Reps,Peso,Equipo,Cantidad,Tempo_Ecc,Tempo_PB,Tempo_Con,Tempo_PT,Descanso_Serie,Grupo,Descanso_Global\n1,Lunes,Press Banca,4,8,60kg,Mancuernas,2,3,1,1,1,90,Tren Superior,2\n1,Lunes,Remo,4,8,50kg,Mancuernas,2,3,1,1,1,90,Tren Superior,2";
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    link.setAttribute("download", "plantilla_gym_12semanas.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function parseNum(val, fallback = 0) {
    if (val === undefined || val === null || val === '') return fallback;
    const cleaned = String(val).replace(/[^\d.-]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? fallback : n;
}

function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const isValidType = file.name.toLowerCase().endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel';
    if (!isValidType) {
        alert('⚠️ Archivo no válido. Selecciona un archivo .csv');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const text = e.target.result;
            const cleanText = text.replace(/^\uFEFF/, '');
            const rows = cleanText.split(/\r?\n/).filter(r => r.trim() !== '');

            if (rows.length < 2) {
                alert('❌ El archivo está vacío o no tiene datos.');
                event.target.value = '';
                return;
            }

            const headers = rows[0].split(',').map(h => h.trim().toLowerCase().replace(/[^\wáéíóúñ]/g, ''));

            const requiredCols = ['semana', 'dia', 'ejercicio'];
            const missingCols = requiredCols.filter(c => !headers.includes(c));
            if (missingCols.length > 0) {
                alert(`❌ Faltan columnas obligatorias: ${missingCols.join(', ')}\n\nCabeceras detectadas: ${headers.join(', ')}`);
                event.target.value = '';
                return;
            }

            const planData = {};
            const invalidRows = [];
            let validCount = 0;

            for (let i = 1; i < rows.length; i++) {
                const cols = rows[i].split(',').map(c => c.trim());
                if (cols.length < 3) continue;

                const rowObj = {};
                headers.forEach((h, idx) => {
                    if (h) rowObj[h] = cols[idx] || '';
                });

                if (!rowObj.ejercicio || rowObj.ejercicio.trim() === '') {
                    invalidRows.push(`Fila ${i + 1}: ejercicio vacío`);
                    continue;
                }

                const semana = String(parseNum(rowObj.semana, 1));
                const dia = (rowObj.dia || 'Lunes').trim();

                const diasValidos = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
                if (!diasValidos.includes(dia)) {
                    invalidRows.push(`Fila ${i + 1}: día inválido "${dia}"`);
                    continue;
                }

                if (!planData[semana]) planData[semana] = {};
                if (!planData[semana][dia]) {
                    planData[semana][dia] = {
                        exercises: [],
                        bodyPart: rowObj.grupo || 'Full Body',
                        restGlobal: parseNum(rowObj.descanso_global, 0)
                    };
                }

                let conVal = rowObj.tempo_con ? String(rowObj.tempo_con).trim().toUpperCase() : '0';
                let isExp = (conVal === 'X');

                planData[semana][dia].exercises.push({
                    name: rowObj.ejercicio,
                    sets: parseNum(rowObj.series, 1),
                    reps: parseNum(rowObj.reps, 1),
                    weight: rowObj.peso || '',
                    equipment: rowObj.equipo || 'Sin equipo',
                    quantity: parseNum(rowObj.cantidad, 2),
                    tempo: {
                        ecc: parseNum(rowObj.tempo_ecc, 0),
                        pb: parseNum(rowObj.tempo_pb, 0),
                        con: isExp ? 1 : parseNum(conVal, 0),
                        pt: parseNum(rowObj.tempo_pt, 0),
                        isExplosive: isExp
                    },
                    rest: { set: parseNum(rowObj.descanso_serie, 0) }
                });
                validCount++;
            }

            if (validCount === 0) {
                alert('❌ No se encontraron ejercicios válidos en el CSV.');
                event.target.value = '';
                return;
            }

            const currentRoutines = JSON.parse(localStorage.getItem('scheduled_routines') || '{}');
            const overwrittenDays = [];
            const preservedDays = [];
            const importedDays = [];

            if (planData['1']) {
                Object.keys(planData['1']).forEach(day => {
                    const r = planData['1'][day];
                    if (!r.exercises || r.exercises.length === 0) return;

                    if (currentRoutines[day]) overwrittenDays.push(day);
                    else importedDays.push(day);

                    let totalSec = 40;
                    r.exercises.forEach((ex, idx) => {
                        const isUni = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
                        const cycle = ex.tempo.ecc + ex.tempo.pb + ex.tempo.con + ex.tempo.pt;
                        for (let s = 1; s <= ex.sets; s++) {
                            totalSec += isUni ? (cycle * ex.reps) * 2 + 8 : (cycle * ex.reps);
                            if (s < ex.sets) totalSec += ex.rest.set;
                        }
                        if (idx < r.exercises.length - 1) totalSec += r.restGlobal * 60;
                    });

                    currentRoutines[day] = {
                        ...r,
                        totalTime: totalSec,
                        restBetweenExercises: r.restGlobal * 60,
                        importedAt: new Date().toISOString()
                    };
                });

                Object.keys(currentRoutines).forEach(day => {
                    if (!planData['1'][day]) preservedDays.push(day);
                });
            }

            let summary = `📋 Resumen de importación:\n\n`;
            summary += `✅ Ejercicios válidos: ${validCount}\n`;
            summary += `📅 Semanas detectadas: ${Object.keys(planData).join(', ')}\n`;
            summary += `🆕 Días nuevos: ${importedDays.join(', ') || 'Ninguno'}\n`;
            if (overwrittenDays.length > 0) {
                summary += `⚠️ Se REEMPLAZARÁN: ${overwrittenDays.join(', ')}\n`;
            }
            if (preservedDays.length > 0) {
                summary += `💾 Se PRESERVARÁN: ${preservedDays.join(', ')}\n`;
            }
            if (invalidRows.length > 0) {
                summary += `\n⚠️ Filas ignoradas: ${invalidRows.length}`;
            }
            summary += `\n\n¿Continuar?`;

            if (!confirm(summary)) {
                alert('❌ Importación cancelada.');
                event.target.value = '';
                return;
            }

            localStorage.setItem('12_week_plan', JSON.stringify(planData));
            localStorage.setItem('scheduled_routines', JSON.stringify(currentRoutines));
            await syncPlanToCloud();
            alert(`✅ ¡Importación exitosa!\n\n${validCount} ejercicios de ${Object.keys(planData).length} semana(s) cargados.`);
            showScheduledRoutines();
        } catch (err) {
            console.error('Error CSV:', err);
            alert('❌ Error al procesar el CSV: ' + err.message);
        }
    };

    reader.onerror = function() { alert('❌ No se pudo leer el archivo.'); };
    reader.readAsText(file, 'UTF-8');
    event.target.value = '';
}

function show12WeekPlan() {
    const section = document.getElementById('twelve-week-section');
    if (!section) {
        alert('⚠️ La sección de Plan 12 Semanas no existe en el HTML.');
        return;
    }
    showInterface('twelve-week-section');
    const planData = JSON.parse(localStorage.getItem('12_week_plan') || '{}');
    const container = document.getElementById('twelve-week-content');
    if (!container) return;

    if (Object.keys(planData).length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#999;">No hay plan importado.</p>';
        return;
    }

    const startDate = new Date();
    startDate.setHours(0,0,0,0);
    const daysMap = { 'Lunes':1,'Martes':2,'Miércoles':3,'Jueves':4,'Viernes':5,'Sábado':6,'Domingo':0 };
    let html = '';

    Object.keys(planData)
        .sort((a,b) => parseInt(a) - parseInt(b))
        .forEach(weekNum => {
            const weekOffset = parseInt(weekNum) - 1;
            html += `<div style="margin-bottom:20px;border:1px solid #ddd;border-radius:10px;overflow:hidden;">
                <div style="background:#0C047D;color:white;padding:10px;font-weight:bold;">Semana ${weekNum}</div>
                <div style="padding:10px;">`;

            Object.keys(planData[weekNum]).forEach(dayName => {
                const routine = planData[weekNum][dayName];
                const dayIndex = daysMap[dayName];
                let daysToAdd = (dayIndex - startDate.getDay() + 7) % 7;
                if (weekOffset > 0 || daysToAdd === 0) daysToAdd += (weekOffset * 7);
                const exactDate = new Date(startDate);
                exactDate.setDate(startDate.getDate() + daysToAdd);
                const dateStr = exactDate.toLocaleDateString('es-ES', { day:'2-digit', month:'short' });
                const exNames = routine.exercises.map(e => e.name).join(', ');

                html += `<div style="background:#f8f9fa;padding:10px;border-radius:8px;margin-bottom:8px;border-left:4px solid #C23D55;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <strong>${dayName}</strong>
                        <span style="font-size:12px;color:#666;">📅 ${dateStr}</span>
                    </div>
                    <p style="font-size:12px;color:#555;margin:5px 0 0 0;">${routine.bodyPart} | ${routine.exercises.length} ej: <small>${exNames}</small></p>
                </div>`;
            });
            html += `</div></div>`;
        });
    container.innerHTML = html;
}

function delete12WeekPlan() {
    if (!confirm('⚠️ ¿Eliminar TODO el plan de 12 semanas y las rutinas programadas?')) return;
    localStorage.removeItem('12_week_plan');
    localStorage.removeItem('scheduled_routines');
    currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
    clearFormInputs();
    document.getElementById('total-time-display').innerText = '00:00';
    document.getElementById('exercise-list').innerHTML = '';
    syncPlanToCloud();
    alert('✅ Plan eliminado.');
    showScheduledRoutines();
}

// ==========================================
// 4. EJECUTOR (CRONOMETRAJE Y AUDIO)
// ==========================================
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;

    if (type === 'metronome') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'square'; osc.frequency.setValueAtTime(1000, now);
        gain.gain.setValueAtTime(0.3, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    } else if (type === 'eccentric') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(250, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.5);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now); osc.stop(now + 0.8);
    } else if (type === 'concentric') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(1200, now + 0.3);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now); osc.stop(now + 0.8);
    } else if (type === 'con-explosive') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(1500, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.15);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now); osc.stop(now + 0.15);
    } else if (type === 'pause-bottom') {
        playDoubleBeep(now);
    } else if (type === 'pause-top') {
        playTripleBeep(now);
    } else if (type === 'transition') {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(800, now + 0.3);
        gain.gain.setValueAtTime(0.4, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
}

function playDoubleBeep(time) {
    const osc1 = audioCtx.createOscillator(); const gain1 = audioCtx.createGain();
    const osc2 = audioCtx.createOscillator(); const gain2 = audioCtx.createGain();
    osc1.connect(gain1); osc2.connect(gain2); gain1.connect(audioCtx.destination); gain2.connect(audioCtx.destination);
    osc1.type = 'sine'; osc1.frequency.setValueAtTime(600, time); gain1.gain.setValueAtTime(0.3, time); gain1.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
    osc1.start(time); osc1.stop(time + 0.1);
    osc2.type = 'sine'; osc2.frequency.setValueAtTime(600, time + 0.2); gain2.gain.setValueAtTime(0.3, time + 0.2); gain2.gain.exponentialRampToValueAtTime(0.01, time + 0.3);
    osc2.start(time + 0.2); osc2.stop(time + 0.3);
}

function playTripleBeep(time) {
    for (let i = 0; i < 3; i++) {
        const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
        osc.connect(gain); gain.connect(audioCtx.destination);
        osc.type = 'sine'; osc.frequency.setValueAtTime(1200, time + (i * 0.15));
        gain.gain.setValueAtTime(0.2, time + (i * 0.15)); gain.gain.exponentialRampToValueAtTime(0.01, time + (i * 0.15) + 0.08);
        osc.start(time + (i * 0.15)); osc.stop(time + (i * 0.15) + 0.08);
    }
}

// ==========================================
// 🆕 buildTimerQueue CON PESO DEL SIGUIENTE EJERCICIO
// ==========================================
function buildTimerQueue() {
    queue = [{ phase: 'Preparación', duration: 40, action: 'prep' }];
    const totalExercises = currentRoutine.exercises.length;
    const restExSeconds = currentRoutine.restBetweenExercises || 0;

    currentRoutine.exercises.forEach((ex, exIndex) => {
        const isUnilateral = (ex.equipment !== 'Sin equipo' && ex.quantity === 1);
        const nextExName = currentRoutine.exercises[exIndex + 1] ? currentRoutine.exercises[exIndex + 1].name : "el final de tu rutina";
        const isLastTwoExercises = (exIndex >= totalExercises - 2);
        const tEcc = parseInt(ex.tempo.ecc) || 0;
        const tPb = parseInt(ex.tempo.pb) || 0;
        const tCon = parseInt(ex.tempo.con) || 0;
        const tPt = parseInt(ex.tempo.pt) || 0;
        const isExp = ex.tempo.isExplosive;

        for (let s = 1; s <= ex.sets; s++) {
            for (let r = 1; r <= ex.reps; r++) {
                const phases = [];
                if (tEcc > 0) phases.push({ phase: 'Excéntrico', duration: tEcc, action: 'ecc' });
                if (tPb > 0) phases.push({ phase: 'Pausa Abajo', duration: tPb, action: 'pause-bottom' });
                if (tCon > 0) {
                    if (isExp) phases.push({ phase: '¡EXPLOSIVO!', duration: 1, action: 'con-explosive' });
                    else phases.push({ phase: 'Concéntrico', duration: tCon, action: 'con' });
                }
                if (tPt > 0) phases.push({ phase: 'Pausa Arriba', duration: tPt, action: 'pause-top' });
                phases.forEach((p, idx) => {
                    queue.push({ ...p, exerciseName: ex.name, setNumber: s, repNumber: r, totalReps: ex.reps, totalSets: ex.sets, sideLabel: isUnilateral ? "Izquierda" : "", blockSide: isUnilateral ? "left" : null, isFirstPhaseOfRep: (idx === 0), isUnilateral });
                });
            }
            if (isUnilateral) {
                queue.push({ phase: 'Transición', duration: 8, action: 'rest-trans', exerciseName: ex.name, setNumber: s, totalSets: ex.sets, nextSide: "Derecha", isUnilateral: true });
                for (let r = 1; r <= ex.reps; r++) {
                    const phases = [];
                    if (tEcc > 0) phases.push({ phase: 'Excéntrico', duration: tEcc, action: 'ecc' });
                    if (tPb > 0) phases.push({ phase: 'Pausa Abajo', duration: tPb, action: 'pause-bottom' });
                    if (tCon > 0) {
                        if (isExp) phases.push({ phase: '¡EXPLOSIVO!', duration: 1, action: 'con-explosive' });
                        else phases.push({ phase: 'Concéntrico', duration: tCon, action: 'con' });
                    }
                    if (tPt > 0) phases.push({ phase: 'Pausa Arriba', duration: tPt, action: 'pause-top' });
                    phases.forEach((p, idx) => {
                        queue.push({ ...p, exerciseName: ex.name, setNumber: s, repNumber: r, totalReps: ex.reps, totalSets: ex.sets, sideLabel: "Derecha", blockSide: "right", isFirstPhaseOfRep: (idx === 0), isUnilateral: true });
                    });
                }
            }
            if (s < ex.sets) queue.push({ phase: 'Descanso entre series', duration: ex.rest.set, action: 'rest', exerciseName: ex.name, setNumber: s, totalSets: ex.sets });
        }
        // 🆕 Descanso entre ejercicios con peso del siguiente
        if (exIndex < totalExercises - 1 && restExSeconds > 0) {
            const nextEx = currentRoutine.exercises[exIndex + 1];
            const nextExWeight = nextEx ? (nextEx.weight || '') : '';
            queue.push({
                phase: 'Descanso entre ejercicios',
                duration: restExSeconds,
                action: 'rest-exercise',
                exerciseName: ex.name,
                nextExName,
                nextExWeight,
                isLastTwoExercises
            });
        }
    });
    queue.push({ phase: '¡Rutina Finalizada!', duration: 5, action: 'finish' });
    currentQueueIndex = 0;
    loadNextPhase();
}

// ==========================================
// 🆕 loadNextPhase CON REGLA DE VOZ SIMPLIFICADA (SIN INHALA/EXHALA)
// ==========================================
function loadNextPhase() {
    if (currentQueueIndex >= queue.length) return;
    const item = queue[currentQueueIndex];

    if (item.duration <= 0) {
        currentQueueIndex++;
        if (currentQueueIndex < queue.length) loadNextPhase();
        else { clearInterval(timerInterval); finishRoutine(); }
        return;
    }

    timeLeftInPhase = item.duration;
    updateTimerUI(item);

    // 🆕 REGLA DE VOZ SIMPLIFICADA (sin "inhala/exhala")
    const isShort = item.duration <= 1;
    const eccFrase = isShort ? "excén" : "excéntrico";
    const conFrase = isShort ? "concén" : "concéntrico";

    if (item.action === 'prep' && timeLeftInPhase === 40) {
        speak("Comienza la preparación", 1.1);
    }
    // 🏋️ EXCÉNTRICO (sin "inhala")
    else if (item.action === 'ecc' && item.duration >= 1) {
        playSound('eccentric');
        if (item.isUnilateral && item.isFirstPhaseOfRep) {
            speak(item.sideLabel + ", " + eccFrase, 1.3);
        } else {
            speak(eccFrase, 1.3);
        }
    }
    // 🧘 PAUSA ABAJO (solo beep)
    else if (item.action === 'pause-bottom' && item.duration >= 1) {
        playSound('pause-bottom');
    }
    // ️ CONCÉNTRICO (sin "exhala")
    else if (item.action === 'con' && item.duration >= 1) {
        playSound('concentric');
        speak(conFrase, 1.3);
    }
    // ⚡ CONCÉNTRICO EXPLOSIVO
    else if (item.action === 'con-explosive' && item.duration >= 1) {
        playSound('con-explosive');
        speak("¡Empuja!", 1.5);
    }
    // 🧘 PAUSA ARRIBA (solo beep)
    else if (item.action === 'pause-top' && item.duration >= 1) {
        playSound('pause-top');
    }
    // 🔄 DESCANSO ENTRE EJERCICIOS
    else if (item.action === 'rest-exercise') {
        playSound('transition');
        if (item.isLastTwoExercises) {
            speak(getRandomMotivationPhrase() + ". Siguiente: " + item.nextExName, 1.15);
        } else {
            speak("Siguiente: " + item.nextExName, 1.2);
        }
    }
    // 🛑 DESCANSO ENTRE SERIES
    else if (item.action === 'rest') {
        speak("Descanso", 1.2);
    }
    // 🏁 FINALIZADO
    else if (item.action === 'finish') {
        speak("Felicidades, has completado tu rutina", 1.1);
        saveHistory();
        clearRoutine();
        releaseWakeLock();
        localStorage.removeItem('paused_routine');
        setTimeout(() => showInterface('history-section'), 3000);
        return;
    }
}

// ==========================================
// 🆕 updateTimerUI CON SIGUIENTE EJERCICIO Y PESO
// ==========================================
function updateTimerUI(item) {
    let title = item.phase;

    if (item.action === 'rest-exercise') {
        title = `Siguiente: ${item.nextExName}`;
        if (item.nextExWeight) {
            title += ` | Peso: ${item.nextExWeight}`;
        }
    }
    else if (item.exerciseName) {
        title = item.exerciseName;
        if (item.isUnilateral && item.sideLabel) {
            title += ` - S${item.setNumber}/${item.totalSets} - ${item.sideLabel} - R${item.repNumber}/${item.totalReps}`;
        } else if (item.setNumber) {
            title += ` - S${item.setNumber}/${item.totalSets} | R${item.repNumber}/${item.totalReps}`;
        }
    }

    document.getElementById('current-phase-title').innerText = title;
    document.getElementById('timer-seconds').innerText = timeLeftInPhase;

    const circle = document.querySelector('.progress-ring__circle');
    if (!circle) return;

    const radius = circle.r.baseVal.value;
    const circumference = radius * 2 * Math.PI;
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = circumference - (timeLeftInPhase / item.duration) * circumference;

    let color = '#ffffff';
    if (item.action === 'ecc') color = '#ff4444';
    else if (item.action === 'pause-bottom') color = '#ffc107';
    else if (item.action === 'con' || item.action === 'con-explosive') color = '#28a745';
    else if (item.action === 'pause-top') color = '#007bff';
    else if (item.action === 'rest' || item.action === 'prep' || item.action === 'rest-trans' || item.action === 'rest-exercise') color = '#aaaaaa';
    circle.style.stroke = color;
}

// ==========================================
// 🆕 tick CON OMISIÓN DE "ASUME TU POSICIÓN" EN TRANSICIONES
// ==========================================
function tick() {
    if (isPaused) return;
    const currentItem = queue[currentQueueIndex];
    const isTempo = (currentItem.action === 'ecc' || currentItem.action === 'pause-bottom' || currentItem.action === 'con' || currentItem.action === 'con-explosive' || currentItem.action === 'pause-top');
    const isRest = (currentItem.action === 'prep' || currentItem.action === 'rest' || currentItem.action === 'rest-trans' || currentItem.action === 'rest-exercise');

    if (isRest) {
        if (timeLeftInPhase === 20) speak("20 segundos", 1.2);
        if (timeLeftInPhase === 8 && currentItem.action !== 'rest-trans') {
            speak("Asume tu posición", 1.2);
        }
        if (timeLeftInPhase <= 5 && timeLeftInPhase > 0) playSound('metronome');
        if (timeLeftInPhase <= 3 && timeLeftInPhase > 0) speak(timeLeftInPhase.toString(), 1.2);
    }

    if (isTempo && currentItem.duration >= 3 && timeLeftInPhase < currentItem.duration && timeLeftInPhase > 0) {
        playSound('metronome');
    }

    if (currentItem.action === 'rest-trans' && timeLeftInPhase === 7) {
        speak("Cambiar a " + currentItem.nextSide, 1.3);
    }

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
        requestWakeLock();
    } else {
        clearInterval(timerInterval);
    }
}

function finishRoutine() {
    clearInterval(timerInterval);
    speak("Rutina finalizada manualmente", 1.1);
    saveHistory();
    clearRoutine();
    releaseWakeLock();
    localStorage.removeItem('paused_routine');
    showInterface('history-section');
}

function pauseAndExit() {
    if (currentQueueIndex === 0 && timeLeftInPhase === 40) {
        if (!confirm('Aún no has iniciado. ¿Volver al programador?')) return;
        clearInterval(timerInterval);
        isPaused = true;
        releaseWakeLock();
        showInterface('programmer-section');
        return;
    }
    if (!confirm('¿Pausar rutina? Podrás retomarla en 14 horas.')) return;
    const pauseState = {
        routine: JSON.parse(JSON.stringify(currentRoutine)),
        queue: JSON.parse(JSON.stringify(queue)),
        queueIndex: currentQueueIndex,
        timeLeft: timeLeftInPhase,
        timestamp: Date.now(),
        scheduledDay: currentScheduledDay,
        bodyPart: document.getElementById('body-part').value
    };
    localStorage.setItem('paused_routine', JSON.stringify(pauseState));
    clearInterval(timerInterval);
    isPaused = true;
    releaseWakeLock();
    showInterface('programmer-section');
    alert('✅ Rutina pausada. Retómala en 14h.');
}

function checkPausedRoutine() {
    const paused = localStorage.getItem('paused_routine');
    if (!paused) return false;
    const state = JSON.parse(paused);
    const hoursPassed = (Date.now() - state.timestamp) / (1000 * 60 * 60);
    if (hoursPassed >= 14) {
        localStorage.removeItem('paused_routine');
        alert('️ La rutina pausada expiró (14h).');
        return false;
    }
    const hLeft = Math.floor(14 - hoursPassed);
    const mLeft = Math.floor((14 - hoursPassed - hLeft) * 60);
    if (confirm(`🔄 Rutina pausada hace ${Math.floor(hoursPassed * 60)} min.\n¿Retomar?\n(Quedan: ${hLeft}h ${mLeft}m)`)) {
        resumeRoutine(state);
        return true;
    } else {
        if (confirm('¿Descartar?')) localStorage.removeItem('paused_routine');
        return false;
    }
}

function resumeRoutine(state) {
    currentRoutine = state.routine;
    queue = state.queue;
    currentQueueIndex = state.queueIndex;
    timeLeftInPhase = state.timeLeft;
    currentScheduledDay = state.scheduledDay;
    showInterface('executor-section');
    updateTimerUI(queue[currentQueueIndex]);
    document.getElementById('btn-start-pause').innerText = 'Reanudar';
    isPaused = true;
    speak("Rutina retomada. Presiona reanudar.", 1.1);
}

function clearRoutine() {
    currentRoutine = { exercises: [], totalTime: 0, restBetweenExercises: 0 };
    editIndex = -1;
    clearFormInputs();
    document.getElementById('total-time-display').innerText = '00:00';
    document.getElementById('exercise-list').innerHTML = '';
    document.querySelector('button[onclick="addExercise()"]').innerText = 'Añadir Ejercicio';
    updateDayInfo(currentScheduledDay, false);
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
        total_time: currentRoutine.totalTime,
        rest_between_exercises: currentRoutine.restBetweenExercises || 0
    };
    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    history.push(record);
    localStorage.setItem('gym_history', JSON.stringify(history));
    if (navigator.onLine && currentUser && supabaseClient) {
        try {
            await supabaseClient.from('routines').insert(record);
        } catch (e) { console.error('Error guardando en Supabase:', e); }
    }
}

async function loadHistory() {
    const sixWeeksAgo = new Date();
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42);
    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    history = history.filter(h => new Date(h.date) >= sixWeeksAgo);
    localStorage.setItem('gym_history', JSON.stringify(history));

    if (navigator.onLine && currentUser && supabaseClient) {
        try {
            const { data } = await supabaseClient.from('routines').select('*').eq('user_id', currentUser.id).order('date', { ascending: false });
            if (data) history = [...data, ...history].filter((v, i, a) => a.findIndex(t => (t.date === v.date && t.body_part === v.body_part && JSON.stringify(t.exercises) === JSON.stringify(v.exercises))) === i);
        } catch (e) { console.error('Error cargando historial:', e); }
    }

    history.sort((a, b) => new Date(b.date) - new Date(a.date));
    allHistoryData = history;
    renderHistoryStats(history);
    applyHistoryFilters();
}

function renderHistoryStats(history) {
    const container = document.getElementById('history-stats');
    const totalRoutines = history.length;
    const totalTime = history.reduce((sum, r) => sum + (r.total_time || 0), 0);
    const streak = calculateStreak(history);
    const favoriteDay = getFavoriteDay(history);

    container.innerHTML = `<div class="stats-grid"> <div class="stat-card"><div class="stat-icon">🏋️</div><div class="stat-value">${totalRoutines}</div><div class="stat-label">Rutinas</div></div> <div class="stat-card"><div class="stat-icon">⏱️</div><div class="stat-value">${formatTime(totalTime)}</div><div class="stat-label">Tiempo total</div></div> <div class="stat-card"><div class="stat-icon">🔥</div><div class="stat-value">${streak}</div><div class="stat-label">Racha (días)</div></div> <div class="stat-card"><div class="stat-icon">⭐</div><div class="stat-value">${favoriteDay || '-'}</div><div class="stat-label">Día favorito</div></div> </div>`;
}

function calculateStreak(history) {
    if (history.length === 0) return 0;
    const uniqueDates = [...new Set(history.map(h => h.date))].sort((a, b) => new Date(b) - new Date(a));
    let streak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 0; i < uniqueDates.length; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(today.getDate() - i);
        const checkDateStr = checkDate.toISOString().split('T')[0];
        if (uniqueDates.includes(checkDateStr)) streak++;
        else break;
    }
    return streak;
}

function getFavoriteDay(history) {
    if (history.length === 0) return null;
    const dayCount = {};
    history.forEach(h => { dayCount[h.day] = (dayCount[h.day] || 0) + 1; });
    return Object.keys(dayCount).reduce((a, b) => dayCount[a] > dayCount[b] ? a : b);
}

function applyHistoryFilters() {
    const search = document.getElementById('history-search').value.toLowerCase();
    const filterDay = document.getElementById('filter-day').value;
    const filterType = document.getElementById('filter-type').value;

    let filtered = allHistoryData.filter(item => {
        const matchSearch = !search || item.exercises.some(e => e.name.toLowerCase().includes(search));
        const matchDay = !filterDay || item.day === filterDay;
        const matchType = !filterType || item.body_part === filterType;
        return matchSearch && matchDay && matchType;
    });
    renderHistoryList(filtered);
}

function renderHistoryList(history) {
    const container = document.getElementById('history-list');
    if (history.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#999;padding:20px;">No hay registros.</p>';
        return;
    }

    container.innerHTML = history.map((item) => {
        const typeIcon = item.body_part === 'Tren Superior' ? '💪' : item.body_part === 'Tren Inferior' ? '' : '🏃';
        const exercisesList = item.exercises.map(e => e.name).join(', ');
        const unilateralCount = item.exercises.filter(e => e.equipment !== 'Sin equipo' && e.quantity === 1).length;

        return `<div class="history-item"> <button class="delete-btn" onclick="deleteHistory(${allHistoryData.indexOf(item)})">×</button> <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"> <span style="font-size:28px;">${typeIcon}</span> <div style="flex:1;"> <h3 style="margin:0;color:#0C047D;font-size:16px;">${item.date}</h3> <p style="margin:2px 0 0 0;font-size:12px;color:#666;">${item.day} • ${item.body_part}</p> </div> </div> <div style="background:#f8f9fa;padding:10px;border-radius:8px;margin-bottom:8px;"> <p style="margin:0;font-size:13px;"><strong>⏱️ ${formatTime(item.total_time)}</strong> • ${item.exercises.length} ejercicios${unilateralCount > 0 ? ` (${unilateralCount} unilateral${unilateralCount > 1 ? 'es' : ''})` : ''}</p> <p style="margin:5px 0 0 0;font-size:12px;color:#666;"><small>${exercisesList}</small></p> </div> <button onclick='reuseRoutine(${allHistoryData.indexOf(item)})' style="width:100%;padding:8px;background:#0C047D;color:white;border:none;border-radius:5px;cursor:pointer;font-size:12px;">🔄 Reutilizar</button> </div>`;
    }).join('');
}

function reuseRoutine(index) {
    const item = allHistoryData[index];
    if (!item) return;
    if (currentRoutine.exercises.length > 0) {
        if (!confirm('¿Reemplazar la rutina actual?')) return;
    }
    currentRoutine = {
        exercises: JSON.parse(JSON.stringify(item.exercises)),
        totalTime: item.total_time,
        restBetweenExercises: item.rest_between_exercises || 0
    };
    currentScheduledDay = item.day;
    document.getElementById('routine-day').value = item.day;
    document.getElementById('body-part').value = item.body_part;
    document.getElementById('rest-ex-global').value = Math.floor((currentRoutine.restBetweenExercises || 0) / 60);
    renderExerciseList();
    document.getElementById('total-time-display').innerText = formatTime(currentRoutine.totalTime);
    updateDayInfo(item.day, true);
    showInterface('programmer-section');
    alert('✅ Rutina cargada en el programador.');
}

function deleteHistory(index) {
    if (!confirm('¿Eliminar este registro?')) return;
    let history = JSON.parse(localStorage.getItem('gym_history') || '[]');
    history.splice(index, 1);
    localStorage.setItem('gym_history', JSON.stringify(history));
    loadHistory();
}

// ==========================================
// 6. UTILIDADES
// ==========================================
function showInterface(id) {
    document.querySelectorAll('.interface').forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden');
    });
    const target = document.getElementById(id);
    if (target) {
        target.classList.remove('hidden');
        target.classList.add('active');
    }
    if (id === 'executor-section') setTimeout(() => checkPausedRoutine(), 300);
}

window.addEventListener('online', () => { if (currentUser) syncPlanToCloud(); });
