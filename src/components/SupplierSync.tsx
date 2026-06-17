import { useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { dbFirestore } from '../lib/firebase';
import { db } from '../db';
import { upsertProjectSummary } from '../lib/projectStore';
import { useAuth } from './AuthContext';

export function SupplierSync() {
  const { role } = useAuth();

  useEffect(() => {
    if (role !== 'proveedor') return;

    // Listen to all projects in cloud_projects
    // In a real production app, we would add a where('sentToSupplier', '==', true)
    // but we already only push projects there if they are sentToSupplier.
    const q = query(collection(dbFirestore, 'cloud_projects'));
    
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      for (const change of snapshot.docChanges()) {
        if (change.type === 'added' || change.type === 'modified') {
          const projectData = change.doc.data() as any;
          // Mask sensitive data before saving it to local Dexie!
          const censoredProject = {
            ...projectData,
            clientName: 'Censurado',
            contactPhone: '',
            clientDocument: '',
            // We set prices to 0 to prevent the supplier from seeing them in Dexie
            spaces: projectData.spaces?.map((space: any) => ({
              ...space,
              windows: space.windows?.map((win: any) => ({
                ...win,
                solutions: win.solutions?.map((sol: any) => ({
                  ...sol,
                  price: 0,
                  installationPrice: 0,
                  motorPrice: 0
                }))
              }))
            }))
          };
          
          await db.projects.put(censoredProject);
          await upsertProjectSummary(censoredProject);
        }
        if (change.type === 'removed') {
          const projectId = Number(change.doc.id) || change.doc.id;
          await db.projects.delete(projectId as any);
          await db.projectSummaries.where('projectId').equals(projectId as any).delete();
        }
      }
    });

    return () => unsubscribe();
  }, [role]);

  return null;
}
