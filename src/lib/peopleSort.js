/* The Family Directory's sort orders (Directory.jsx). */
import { daysToBirthday, fullName } from "./store";

/** By birth date, oldest first (dir 1) or youngest first (-1). Relatives whose birth date isn't recorded (possible on a
 *  family server, never in the demo) come last either way. */
const byBorn = (dir) => (a, b) => (!a.born - !b.born) || (a.born && b.born ? dir * a.born.localeCompare(b.born) : 0);

export const DIRECTORY_SORTS = {
  generation: (a, b) => a.gen - b.gen || byBorn(1)(a, b),
  nameAZ: (a, b) => fullName(a).localeCompare(fullName(b)),
  nameZA: (a, b) => fullName(b).localeCompare(fullName(a)),
  birthday: (a, b) => (a.died ? 999 : daysToBirthday(a) ?? 998) - (b.died ? 999 : daysToBirthday(b) ?? 998),
  oldestPerson: byBorn(1),
  youngestPerson: byBorn(-1),
};
