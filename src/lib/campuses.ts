// The two campuses the Bus widget shows trips to (university places: names not
// translated). Positions: the campus addresses from the national address base
// (Sainte-Marthe: 74 rue Louis Pasteur; Agroparc: Campus Agrosciences, 301 rue
// Baruch de Spinoza). Trips end at a stop within walking distance (lib/journey).
export const CAMPUSES = [
  { id: 'sainteMarthe', name: 'Sainte-Marthe', lat: 43.949669, lon: 4.817115 },
  { id: 'agroparc', name: 'Agroparc', lat: 43.912027, lon: 4.889529 },
] as const;

export type Campus = (typeof CAMPUSES)[number];
export type CampusId = Campus['id'];

export const campusById = (id: string | null | undefined): Campus | null => CAMPUSES.find((c) => c.id === id) ?? null;
