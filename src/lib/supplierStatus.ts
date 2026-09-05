import { collection, doc, setDoc, onSnapshot } from 'firebase/firestore';
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

/**
 * Igual que `useSupplierStatuses` pero para TODOS los pedidos de una sola vez:
 * `{ docId: { solutionId: true } }`.
 *
 * El Dashboard del proveedor necesita saber cuánto lleva gestionado CADA
 * pedido para poder ordenarlos y filtrarlos. Hacerlo con el hook de a uno
 * abría un listener de Firestore por tarjeta; este abre uno solo para la
 * colección entera.
 */
export function useAllSupplierStatuses(enabled: boolean): Record<string, SupplierStatuses> {
  const [all, setAll] = useState<Record<string, SupplierStatuses>>({});

  useEffect(() => {
    if (!enabled) return;
    const ref = collection(dbFirestore, 'supplier_statuses');
    const unsub = onSnapshot(
      ref,
      snap => {
        const next: Record<string, SupplierStatuses> = {};
        snap.forEach(document => {
          next[document.id] = document.data() as SupplierStatuses;
        });
        setAll(next);
      },
      error => console.error('No se pudo leer el avance de los pedidos', error),
    );
    return unsub;
  }, [enabled]);

  return all;
}
