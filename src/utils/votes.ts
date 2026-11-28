/**
 * Yes votes needed to agree dinner: a strict majority. With two people both must say yes, so
 * nobody can agree dinner on everyone else's behalf with one tap.
 */
export const votesNeeded = (people: number) => (people <= 1 ? 1 : Math.floor(people / 2) + 1);
