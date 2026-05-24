/**
 * Random Handle Generator for Antelog
 * Format: adjective_animalNN (e.g., @sunset_koala47)
 * 100 adjectives × 100 animals × 90 numbers = 900,000 possible combinations
 */

const ADJECTIVES = [
  'sunset', 'moonlight', 'crystal', 'shadow', 'golden', 'silver', 'bright',
  'misty', 'gentle', 'swift', 'quiet', 'wild', 'calm', 'bold', 'wise',
  'brave', 'clever', 'nimble', 'sleepy', 'happy', 'cosmic', 'electric',
  'velvet', 'jade', 'amber', 'ruby', 'azure', 'frost', 'storm', 'dawn',
  'dusk', 'stellar', 'lunar', 'solar', 'crimson', 'violet', 'emerald',
  'sapphire', 'ocean', 'forest', 'mountain', 'river', 'breeze', 'thunder',
  'whisper', 'echo', 'dream', 'starlight', 'aurora', 'mystic', 'phantom',
  'marble', 'bronze', 'pearl', 'coral', 'ivory', 'obsidian', 'quartz',
  'topaz', 'garnet', 'opal', 'diamond', 'platinum', 'copper', 'steel',
  'iron', 'silk', 'satin', 'linen', 'cotton', 'wool', 'cashmere', 'velour',
  'midnight', 'twilight', 'sunrise', 'daybreak', 'evening', 'morning', 'noon',
  'zenith', 'horizon', 'celestial', 'ethereal', 'radiant', 'luminous', 'glowing',
  'shimmering', 'sparkling', 'gleaming', 'blazing', 'flaming', 'frozen', 'arctic',
  'tropical', 'alpine', 'coastal', 'desert', 'prairie', 'tundra', 'savanna',
];

const ANIMALS = [
  'koala', 'panda', 'raccoon', 'otter', 'fox', 'wolf', 'bear', 'eagle',
  'hawk', 'owl', 'raven', 'sparrow', 'dolphin', 'whale', 'shark', 'tiger',
  'lion', 'leopard', 'cheetah', 'lynx', 'deer', 'elk', 'moose', 'rabbit',
  'squirrel', 'badger', 'beaver', 'seal', 'walrus', 'penguin', 'falcon',
  'phoenix', 'dragon', 'serpent', 'tortoise', 'gecko', 'cobra', 'python',
  'jaguar', 'panther', 'gazelle', 'antelope', 'flamingo', 'crane', 'heron',
  'pelican', 'albatross', 'condor', 'vulture', 'peacock', 'swan', 'duck',
  'goose', 'turkey', 'crow', 'magpie', 'jay', 'finch', 'cardinal', 'robin',
  'wren', 'thrush', 'warbler', 'lark', 'nightingale', 'swallow', 'swift',
  'parrot', 'macaw', 'cockatoo', 'budgie', 'canary', 'pigeon', 'dove',
  'quail', 'pheasant', 'grouse', 'stork', 'ibis', 'egret', 'kingfisher',
  'woodpecker', 'hummingbird', 'toucan', 'hornbill', 'kiwi', 'emu', 'ostrich',
  'rhea', 'cassowary', 'kestrel', 'merlin', 'harrier', 'buzzard', 'kite',
  'osprey', 'puffin', 'wombat', 'platypus', 'lemur', 'meerkat', 'mongoose',
];

/** Generate a random handle in adjective_animalNN format */
export function generateRandomHandle(): string {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const number = Math.floor(Math.random() * 90) + 10; // 10-99
  return `${adjective}_${animal}${number}`;
}

/** Generate a unique handle by checking against existing profiles */
export async function generateUniqueHandle(supabaseClient: any): Promise<string> {
  let handle = generateRandomHandle();
  let attempts = 0;

  while (attempts < 20) {
    const { data } = await supabaseClient
      .from('profiles')
      .select('handle')
      .eq('handle', handle)
      .maybeSingle();

    if (!data) return handle;

    handle = generateRandomHandle();
    attempts++;
  }

  // Fallback with timestamp suffix
  return `${handle}_${Date.now().toString().slice(-3)}`;
}
