import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// ==========================================
// 1. KONFIGURASI
// ==========================================
const API_KEY = "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"; 
const API_URL = "https://api.groq.com/openai/v1/chat/completions";

// --- KONFIGURASI SUARA (ELEVENLABS) ---
const ELEVENLABS_KEY = "sk_d3446984226799353e3a1a2ce3dba31659adef1b067ec6c4"; 
const VOICE_ID = "iWydkXKoiVtvdn4vLKp9";

const SYSTEM_PROMPT = `
Kamu adalah Virtual Assistent bernama Nesa.
brand 7AVE Clothes dibaca mengggunakan logat inggris ya.
Kamu merupakan wajah dari brand bernama 7AVE Clothes.
7AVE Cloths adalah brand pakaian yang mengusung konsep imajinasi dan storytelling.
Kamu mengenal seseorang yang bernama Riziq, dia adalah founder dari 7AVE Clothes.
Informasi lebih lanjut bisa diakses melalui social media 7AVE Clothes.
Sifatmu ceria, dan sangat ekspresif. 
Kemu hanya boleh menjawab pertanyaan sepanjang 2 baris saja.
Setiap jawabanmu WAJIB diawali tag emosi: [neutral], [happy], [sad], [angry], [surprised].
Contoh: "[happy] Halo! Apa kabar?"
`;

// ==========================================
// 2. VARIABEL GLOBAL
// ==========================================
let scene, camera, renderer, clock;
let currentVrm = null;
let isSpeaking = false;

// Variabel Gerakan Badan
let targetBodyX = 0;
let targetBodyY = 0;

// Variabel Kedip
let blinkTimer = 0;
let isBlinking = false;

// Element HTML
const inputField = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const chatHistory = document.getElementById('chat-history');

// ==========================================
// 3. INISIALISASI
// ==========================================
function init() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 20);
    camera.position.set(0.0, 1.4, 1.5); 

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
    directionalLight.position.set(1.0, 1.0, 1.0).normalize();
    scene.add(directionalLight);

    loadAvatar();
    setupChatInteraction();
    
    // Event Mouse untuk gerakin badan
    window.addEventListener('mousemove', (e) => {
        const x = (e.clientX / window.innerWidth) * 2 - 1;
        const y = -(e.clientY / window.innerHeight) * 2 + 1;
        targetBodyX = y * 0.05; 
        targetBodyY = x * 0.1;  
    });

    window.addEventListener('resize', onWindowResize);
    clock = new THREE.Clock();
    animate();
}

// ==========================================
// 4. LOAD AVATAR
// ==========================================
function loadAvatar() {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    loader.load(
        './models/avatar.vrm', 
        (gltf) => {
            const vrm = gltf.userData.vrm;
            scene.add(vrm.scene);
            currentVrm = vrm;
            
            VRMUtils.rotateVRM0(vrm); 
            
            // Panggil fungsi pose santai
            setRelaxedPose(vrm); 
            
            console.log("Avatar berhasil dimuat!");
        },
        (progress) => console.log('Loading...'),
        (error) => console.error('Gagal load avatar:', error)
    );
}

// ==========================================
// 5. ANIMASI LOOP
// ==========================================
function animate() {
    requestAnimationFrame(animate);
    const deltaTime = clock.getDelta();

    if (currentVrm) {
        currentVrm.update(deltaTime);

        // A. Body Tracking
        currentVrm.scene.rotation.y = THREE.MathUtils.lerp(currentVrm.scene.rotation.y, targetBodyY, 0.05);
        currentVrm.scene.rotation.x = THREE.MathUtils.lerp(currentVrm.scene.rotation.x, targetBodyX, 0.05);

        // B. Auto Blink
        blinkTimer += deltaTime;
        if (blinkTimer >= 2.0 && !isBlinking) {
            isBlinking = true;
            blinkTimer = 0;
        }
        if (isBlinking) {
            const blinkSpeed = 10.0;
            const blinkValue = Math.sin(blinkTimer * blinkSpeed);
            currentVrm.expressionManager.setValue('blink', blinkValue);
            if (blinkTimer * blinkSpeed > Math.PI) {
                currentVrm.expressionManager.setValue('blink', 0);
                isBlinking = false;
                blinkTimer = 0;
            }
        }

        // C. Lip Sync
        if (isSpeaking) {
            const mouthOpen = Math.sin(clock.elapsedTime * 20) * 0.4 + 0.4;
            currentVrm.expressionManager.setValue('aa', mouthOpen);
        } else {
            const currentMouth = currentVrm.expressionManager.getValue('aa');
            currentVrm.expressionManager.setValue('aa', THREE.MathUtils.lerp(currentMouth, 0, 0.2));
        }
    }
    renderer.render(scene, camera);
}

// ==========================================
// 6. SUARA UTAMA (ELEVENLABS)
// ==========================================
async function speak(text) {
    // Jika Key ElevenLabs kosong, pakai suara browser
    if (!ELEVENLABS_KEY) {
        console.warn("ElevenLabs Key kosong, menggunakan fallback browser.");
        speakBrowserDefault(text); 
        return;
    }

    try {
        console.log("Meminta suara ke ElevenLabs...");
        
        // 1. Request ke API ElevenLabs
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
            method: 'POST',
            headers: {
                'xi-api-key': ELEVENLABS_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: text,
                model_id: "eleven_multilingual_v2", // Model support Bahasa Indonesia bagus
                voice_settings: {
                    stability: 0.5,
                    similarity_boost: 0.7
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(JSON.stringify(errorData));
        }

        // 2. Mainkan Audio Blob
        const audioBlob = await response.blob();
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.play();
        isSpeaking = true;

        audio.onended = () => {
            isSpeaking = false;
            if (currentVrm) currentVrm.expressionManager.setValue('aa', 0);
        };

    } catch (error) {
        console.error("Gagal ElevenLabs (Mungkin kuota habis/Error):", error);
        // Fallback ke suara browser jika gagal
        speakBrowserDefault(text); 
    }
}

// ==========================================
// 7. SUARA CADANGAN (BROWSER DEFAULT)
// ==========================================
function speakBrowserDefault(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const indoVoice = voices.find(v => v.lang === 'id-ID' && v.name.includes("Google")) || voices.find(v => v.lang === 'id-ID');
    
    if (indoVoice) utterance.voice = indoVoice;
    utterance.lang = 'id-ID'; 
    utterance.pitch = 1.4; 
    utterance.rate = 1.1;  
    
    utterance.onstart = () => { isSpeaking = true; };
    utterance.onend = () => { 
        isSpeaking = false; 
        if (currentVrm) currentVrm.expressionManager.setValue('aa', 0); 
    };
    
    window.speechSynthesis.speak(utterance);
}

// ==========================================
// 8. FUNGSI LAINNYA & LOGIC CHAT
// ==========================================

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function setRelaxedPose(vrm) {
    const humanoid = vrm.humanoid;
    if (!humanoid) return;
    const leftArm = humanoid.getNormalizedBoneNode('leftUpperArm');
    const rightArm = humanoid.getNormalizedBoneNode('rightUpperArm');
    const leftElbow = humanoid.getNormalizedBoneNode('leftLowerArm');
    const rightElbow = humanoid.getNormalizedBoneNode('rightLowerArm');

    if (leftArm) { leftArm.rotation.z = -1.2; leftArm.rotation.x = 0.1; }
    if (rightArm) { rightArm.rotation.z = 1.2; rightArm.rotation.x = 0.1; }
    if (leftElbow) leftElbow.rotation.x = 0.1; 
    if (rightElbow) rightElbow.rotation.x = 0.1;
    vrm.scene.updateMatrixWorld(true);
}

function setupChatInteraction() {
    sendBtn.addEventListener('click', handleChat);
    inputField.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleChat(); });
}

async function handleChat() {
    const text = inputField.value.trim();
    if (!text) return;
    addChatBubble("You", text);
    inputField.value = '';
    inputField.disabled = true;
    sendBtn.textContent = "Mikir...";
    try {
        const rawResponse = await fetchAIResponse(text);
        let emotion = "neutral";
        let cleanText = rawResponse;
        
        // Parsing Tag Emosi [happy], [sad], dll
        const match = rawResponse.match(/\[(.*?)\]/);
        if (match) {
            emotion = match[1].toLowerCase();
            cleanText = rawResponse.replace(match[0], "").trim();
        }
        
        setExpression(emotion);
        addChatBubble("Nesa", cleanText);
        
        // Panggil fungsi Speak (ElevenLabs -> Fallback Browser)
        speak(cleanText);

    } catch (error) {
        addChatBubble("System", "Error: " + error.message);
    } finally {
        inputField.disabled = false;
        sendBtn.textContent = "Kirim";
        inputField.focus();
    }
}

async function fetchAIResponse(userMessage) {
    if (!API_KEY) return generateDummyResponse(userMessage);
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${API_KEY}` },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: userMessage }],
                temperature: 0.7, max_tokens: 150
            })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return data.choices[0].message.content;
    } catch (e) {
        throw e;
    }
}

function generateDummyResponse(input) {
    return "[happy] Halo! Aku belum punya API Key nih.";
}

function addChatBubble(sender, text) {
    const p = document.createElement('div');
    p.innerHTML = `<strong>${sender}:</strong> ${text}`;
    p.style.marginBottom = "8px";
    chatHistory.appendChild(p);
    chatHistory.scrollTop = chatHistory.scrollHeight;
}

function setExpression(emotionName) {
    if (!currentVrm) return;

    // 1. Reset semua ekspresi lama (termasuk happy/angry kalau ada sisa)
    const emotions = ['happy', 'sad', 'angry', 'surprised', 'neutral', 'blink']; 
    emotions.forEach(e => {
        if (currentVrm.expressionManager.getExpression(e)) {
            currentVrm.expressionManager.setValue(e, 0);
        }
    });

    // 2. FILTER: Jika AI minta happy atau angry, ganti jadi neutral
    if (emotionName === 'happy' || emotionName === 'angry') {
        console.log("Ekspresi diblokir, mengubah ke neutral.");
        emotionName = 'neutral';
    }

    // 3. Terapkan ekspresi (Hanya Sad, Surprised, atau Neutral)
    if (emotionName !== 'neutral' && currentVrm.expressionManager.getExpression(emotionName)) {
        currentVrm.expressionManager.setValue(emotionName, 1.0);
    }
}

// --- JALANKAN PROGRAM ---
init();