import { doc, setDoc } from 'firebase/firestore';
import { dbFirestore } from './firebase';
import type { TechnicalProject } from '../types';

export async function syncProjectToCloud(project: TechnicalProject) {
  try {
    // If it's sent to supplier, we push it to the "cloud_projects" collection
    // We remove local-only fields or simply push the whole project
    // Note: We might want to censor it here, or censor it on read for the supplier.
    // Censoring on read via a Cloud Function is more secure, but since we are purely client-side right now:
    // We will push the full project to "cloud_projects" and use Firestore Security Rules (or frontend masking if rules aren't set)
    // For maximum security without backend logic, we could create a "supplier_projects" collection with pre-censored data.
    
    // For now, we push to "cloud_projects"
    const projectRef = doc(dbFirestore, 'cloud_projects', String(project.id || project.code));
    
    await setDoc(projectRef, {
      ...project,
      lastSyncedToCloud: Date.now()
    }, { merge: true });

    return true;
  } catch (error) {
    console.error("Error syncing project to cloud:", error);
    throw error;
  }
}
