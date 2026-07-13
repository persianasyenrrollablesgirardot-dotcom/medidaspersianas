import { doc, setDoc, deleteDoc } from 'firebase/firestore';
import { dbFirestore } from './firebase';
import type { TechnicalProject, TechnicalCatalog } from '../types';

export async function syncProjectToCloud(project: TechnicalProject, catalog?: TechnicalCatalog) {
  try {
    const projectRef = doc(dbFirestore, 'cloud_projects', String(project.id || project.code));
    
    if (project.sentToSupplier) {
      await setDoc(projectRef, {
        ...project,
        catalogSnapshot: catalog ? { customWindowFields: catalog.customWindowFields } : null,
        lastSyncedToCloud: Date.now()
      }, { merge: true });
    } else {
      // If it's withdrawn from the supplier, delete it from the cloud
      await deleteDoc(projectRef);
    }

    return true;
  } catch (error) {
    console.error("Error syncing project to cloud:", error);
    throw error;
  }
}
