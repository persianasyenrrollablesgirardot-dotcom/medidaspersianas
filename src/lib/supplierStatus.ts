import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { dbFirestore } from './firebase';
import { useState, useEffect } from 'react';

export type SupplierStatuses = Record<string, boolean>; // solutionId -> true if gestionado

/** Converts a project to a stable Firestore document ID */
export function supplierStatusDocId(projectId: number | undefined, projectCode: string | undefined): string {
  return String(projectId || projectCode || 'unknown');
}

/** Mark or unmark a solution as gestionado in Firestore */
export async function setSupplierStatus(docId: string, solutionId: string, value: boolean) {
  const ref = doc(dbFirestore, 'supplier_statuses', docId);
  await setDoc(ref, { [solutionId]: value }, { merge: true });
}

/** React hook: listens to supplier_statuses in real-time */
export function useSupplierStatuses(docId: string | undefined): SupplierStatuses {
  const [statuses, setStatuses] = useState<SupplierStatuses>({});

  useEffect(() => {
    if (!docId) return;
    const ref = doc(dbFirestore, 'supplier_statuses', docId);
    const unsub = onSnapshot(ref, (snap) => {
      setStatuses(snap.exists() ? (snap.data() as SupplierStatuses) : {});
    });
    return unsub;
  }, [docId]);

  return statuses;
}
