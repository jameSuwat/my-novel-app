import { db } from "./firebase";
import {
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";

// Strip chapters before writing to the novel doc (chapters live in subcollection)
export function stripChapters(novel) {
  const { chapters, ...meta } = novel;
  return meta;
}

// Push all novels + chapters to Firestore in batches (max 400 ops each)
export async function pushAllToCloud(uid, novelList) {
  const ops = [];
  for (const n of novelList) {
    ops.push({
      ref: doc(db, "users", uid, "novels", n.id),
      data: stripChapters(n),
    });
    for (const ch of n.chapters || []) {
      ops.push({
        ref: doc(db, "users", uid, "novels", n.id, "chapters", ch.id),
        data: ch,
      });
    }
  }
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => batch.set(op.ref, op.data));
    await batch.commit();
  }
}

// Save a single novel doc (meta only, no chapters)
export async function saveNovelDoc(uid, novel) {
  await setDoc(doc(db, "users", uid, "novels", novel.id), stripChapters(novel));
}

// Save a single chapter doc
export async function saveChapterDoc(uid, novelId, chapter) {
  await setDoc(
    doc(db, "users", uid, "novels", novelId, "chapters", chapter.id),
    chapter
  );
}

// Delete a chapter doc
export async function deleteChapterDoc(uid, novelId, chapterId) {
  await deleteDoc(doc(db, "users", uid, "novels", novelId, "chapters", chapterId));
}

// Delete a novel and all its chapters
export async function deleteNovelAndChapters(uid, novelId) {
  const chSnap = await getDocs(
    collection(db, "users", uid, "novels", novelId, "chapters")
  );
  const refs = [
    ...chSnap.docs.map((d) => d.ref),
    doc(db, "users", uid, "novels", novelId),
  ];
  for (let i = 0; i < refs.length; i += 400) {
    const batch = writeBatch(db);
    refs.slice(i, i + 400).forEach((r) => batch.delete(r));
    await batch.commit();
  }
}

// Load all novels and their chapters from Firestore
export async function loadAllNovels(uid) {
  const snap = await getDocs(collection(db, "users", uid, "novels"));
  const loaded = [];
  for (const nSnap of snap.docs) {
    const meta = nSnap.data();
    const chSnap = await getDocs(
      collection(db, "users", uid, "novels", nSnap.id, "chapters")
    );
    const chapters = chSnap.docs
      .map((d) => d.data())
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    loaded.push({ ...meta, id: nSnap.id, chapters });
  }
  return loaded;
}
