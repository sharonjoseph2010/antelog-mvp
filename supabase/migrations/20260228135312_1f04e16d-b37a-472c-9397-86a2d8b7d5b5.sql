
-- Update handle_user_signup to generate random adjective_animal handles
CREATE OR REPLACE FUNCTION public.handle_user_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  generated_handle TEXT;
  handle_exists BOOLEAN;
  user_phone TEXT;
  user_full_name TEXT;
  adjectives TEXT[] := ARRAY[
    'sunset','moonlight','crystal','shadow','golden','silver','bright','misty',
    'gentle','swift','quiet','wild','calm','bold','wise','brave','clever',
    'nimble','sleepy','happy','cosmic','electric','velvet','jade','amber',
    'ruby','azure','frost','storm','dawn','dusk','stellar','lunar','solar',
    'crimson','violet','emerald','sapphire','ocean','forest','mountain',
    'river','breeze','thunder','whisper','echo','dream','starlight','aurora',
    'mystic','phantom','marble','bronze','pearl','coral','ivory','obsidian',
    'quartz','topaz','garnet','opal','diamond','platinum','copper','steel',
    'iron','silk','satin','linen','cotton','wool','cashmere','velour',
    'midnight','twilight','sunrise','daybreak','evening','morning','noon',
    'zenith','horizon','celestial','ethereal','radiant','luminous','glowing',
    'shimmering','sparkling','gleaming','blazing','flaming','frozen','arctic',
    'tropical','alpine','coastal','desert','prairie','tundra','savanna'
  ];
  animals TEXT[] := ARRAY[
    'koala','panda','raccoon','otter','fox','wolf','bear','eagle','hawk',
    'owl','raven','sparrow','dolphin','whale','shark','tiger','lion','leopard',
    'cheetah','lynx','deer','elk','moose','rabbit','squirrel','badger',
    'beaver','seal','walrus','penguin','falcon','phoenix','dragon','serpent',
    'tortoise','gecko','cobra','python','jaguar','panther','gazelle','antelope',
    'flamingo','crane','heron','pelican','albatross','condor','vulture',
    'peacock','swan','duck','goose','turkey','crow','magpie','jay','finch',
    'cardinal','robin','wren','thrush','warbler','lark','nightingale','swallow',
    'swift','parrot','macaw','cockatoo','budgie','canary','pigeon','dove',
    'quail','pheasant','grouse','stork','ibis','egret','kingfisher',
    'woodpecker','hummingbird','toucan','hornbill','kiwi','emu','ostrich',
    'rhea','cassowary','kestrel','merlin','harrier','buzzard','kite',
    'osprey','puffin','wombat','platypus','lemur','meerkat','mongoose'
  ];
BEGIN
  -- Extract phone number and full name from metadata
  user_phone := NEW.raw_user_meta_data->>'phone_number';
  user_full_name := NEW.raw_user_meta_data->>'full_name';
  
  -- Generate a random adjective_animalNN handle
  LOOP
    generated_handle := adjectives[1 + floor(random() * array_length(adjectives, 1))]
      || '_'
      || animals[1 + floor(random() * array_length(animals, 1))]
      || (10 + floor(random() * 90))::text;
    
    SELECT EXISTS(SELECT 1 FROM profiles WHERE handle = generated_handle) INTO handle_exists;
    EXIT WHEN NOT handle_exists;
  END LOOP;
  
  -- Create profile for new user
  INSERT INTO public.profiles (
    id, handle, phone_number, full_name, user_type, is_verified, trial_ends_at
  )
  VALUES (
    NEW.id,
    generated_handle,
    user_phone,
    user_full_name,
    COALESCE(NEW.raw_user_meta_data->>'user_type', 'guest')::user_type,
    false,
    CASE WHEN COALESCE(NEW.raw_user_meta_data->>'user_type', 'guest') = 'verified' 
      THEN now() + interval '2 months' 
      ELSE NULL 
    END
  );
  
  RETURN NEW;
END;
$function$;

-- Update ALL existing users to random handles
DO $$
DECLARE
  user_record RECORD;
  new_handle TEXT;
  handle_exists BOOLEAN;
  adjectives TEXT[] := ARRAY[
    'sunset','moonlight','crystal','shadow','golden','silver','bright','misty',
    'gentle','swift','quiet','wild','calm','bold','wise','brave','clever',
    'nimble','sleepy','happy','cosmic','electric','velvet','jade','amber',
    'ruby','azure','frost','storm','dawn','dusk','stellar','lunar','solar',
    'crimson','violet','emerald','sapphire','ocean','forest','mountain',
    'river','breeze','thunder','whisper','echo','dream','starlight','aurora',
    'mystic','phantom','marble','bronze','pearl','coral','ivory','obsidian',
    'quartz','topaz','garnet','opal','diamond','platinum','copper','steel',
    'iron','silk','satin','linen','cotton','wool','cashmere','velour',
    'midnight','twilight','sunrise','daybreak','evening','morning','noon',
    'zenith','horizon','celestial','ethereal','radiant','luminous','glowing',
    'shimmering','sparkling','gleaming','blazing','flaming','frozen','arctic',
    'tropical','alpine','coastal','desert','prairie','tundra','savanna'
  ];
  animals TEXT[] := ARRAY[
    'koala','panda','raccoon','otter','fox','wolf','bear','eagle','hawk',
    'owl','raven','sparrow','dolphin','whale','shark','tiger','lion','leopard',
    'cheetah','lynx','deer','elk','moose','rabbit','squirrel','badger',
    'beaver','seal','walrus','penguin','falcon','phoenix','dragon','serpent',
    'tortoise','gecko','cobra','python','jaguar','panther','gazelle','antelope',
    'flamingo','crane','heron','pelican','albatross','condor','vulture',
    'peacock','swan','duck','goose','turkey','crow','magpie','jay','finch',
    'cardinal','robin','wren','thrush','warbler','lark','nightingale','swallow',
    'swift','parrot','macaw','cockatoo','budgie','canary','pigeon','dove',
    'quail','pheasant','grouse','stork','ibis','egret','kingfisher',
    'woodpecker','hummingbird','toucan','hornbill','kiwi','emu','ostrich',
    'rhea','cassowary','kestrel','merlin','harrier','buzzard','kite',
    'osprey','puffin','wombat','platypus','lemur','meerkat','mongoose'
  ];
BEGIN
  FOR user_record IN SELECT id FROM profiles
  LOOP
    LOOP
      new_handle := adjectives[1 + floor(random() * array_length(adjectives, 1))]
        || '_'
        || animals[1 + floor(random() * array_length(animals, 1))]
        || (10 + floor(random() * 90))::text;
      
      SELECT EXISTS(SELECT 1 FROM profiles WHERE handle = new_handle) INTO handle_exists;
      EXIT WHEN NOT handle_exists;
    END LOOP;
    
    UPDATE profiles SET handle = new_handle WHERE id = user_record.id;
  END LOOP;
END;
$$;
