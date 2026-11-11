// Firebase 초기화와 데이터 위치(참조)를 한곳에 모아 둡니다.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app-check.js';
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
    updatePassword, EmailAuthProvider, reauthenticateWithCredential
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import {
    getFirestore, collection, doc, getDocs, onSnapshot, setDoc, updateDoc, deleteDoc,
    query, orderBy, limit, where, runTransaction
} from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const app = initializeApp({
    apiKey: 'AIzaSyCOoezL6-0vKjwb1GU2dTieg5uYjxqB6Qw',
    authDomain: 'maseok103.firebaseapp.com',
    projectId: 'maseok103',
    storageBucket: 'maseok103.firebasestorage.app',
    messagingSenderId: '1056321756965',
    appId: '1:1056321756965:web:2ea030462c941d6b7204cc',
    measurementId: 'G-J7LS6814QQ'
});

initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider('6LeGQBMuAAAAALFi8ooUFOPQxGOZGUuS-SotxS2O'),
    isTokenAutoRefreshEnabled: true
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const LOGIN_DOMAIN = 'maseok103.firebaseapp.com';

const CLASS_ID = 'maseok103-1-3';
const classroom = doc(db, 'classrooms', CLASS_ID);

export const refs = {
    classroom,
    state: doc(db, 'classrooms', CLASS_ID, 'shared', 'data'),
    cleaning: doc(db, 'classrooms', CLASS_ID, 'shared', 'cleaning'),
    timetable: doc(db, 'classrooms', CLASS_ID, 'shared', 'timetable'),
    users: collection(db, 'classrooms', CLASS_ID, 'users'),
    notices: collection(db, 'classrooms', CLASS_ID, 'notices'),
    suggestions: collection(db, 'classrooms', CLASS_ID, 'suggestions'),
    banners: collection(db, 'classrooms', CLASS_ID, 'banners'),
    todos: collection(classroom, 'todos'),
    todo: uid => doc(classroom, 'todos', uid)
};

// Cloudinary 무료 플랜 (unsigned upload preset)
const CLOUDINARY = { cloud: 'acg3kbrn', preset: 'maseok103_upload' };

export async function uploadImage(file, folder) {
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', CLOUDINARY.preset);
    form.append('folder', folder);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(CLOUDINARY.cloud)}/image/upload`, {
        method: 'POST',
        body: form
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error?.message || '사진 업로드에 실패했습니다.');
    return { url: json.secure_url, publicId: json.public_id };
}

export {
    onAuthStateChanged, signInWithEmailAndPassword, signOut, updatePassword,
    EmailAuthProvider, reauthenticateWithCredential,
    collection, doc, getDocs, onSnapshot, setDoc, updateDoc, deleteDoc,
    query, orderBy, limit, where, runTransaction
};
