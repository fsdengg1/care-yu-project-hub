export type Appearance = 'light' | 'dark';

export const APPEARANCE_KEY = 'cya_appearance';

export function getStoredAppearance(): Appearance {
  if (typeof window === 'undefined') return 'dark';
  return window.localStorage.getItem(APPEARANCE_KEY) === 'light' ? 'light' : 'dark';
}

export function applyAppearance(appearance: Appearance) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(appearance);
  root.style.colorScheme = appearance;
  window.localStorage.setItem(APPEARANCE_KEY, appearance);
}

export const APPEARANCE_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('${APPEARANCE_KEY}')==='light'?'light':'dark';var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(t);r.style.colorScheme=t;}catch(e){}})();`;
