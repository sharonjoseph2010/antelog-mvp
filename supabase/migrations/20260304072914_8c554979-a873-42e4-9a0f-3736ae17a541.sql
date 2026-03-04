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
  requested_user_type user_type;
  final_user_type user_type;
  trusted_share_signup BOOLEAN := false;
  final_is_verified BOOLEAN := false;
  final_verification_status verification_status := 'pending'::verification_status;
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
  -- Extract metadata
  user_phone := NEW.raw_user_meta_data->>'phone_number';
  user_full_name := NEW.raw_user_meta_data->>'full_name';
  requested_user_type := COALESCE(NEW.raw_user_meta_data->>'user_type', 'guest')::user_type;
  trusted_share_signup := COALESCE((NEW.raw_user_meta_data->>'is_share_signup')::boolean, false);

  -- Share-link signups are trusted
  final_user_type := CASE WHEN trusted_share_signup THEN 'verified'::user_type ELSE requested_user_type END;
  final_is_verified := trusted_share_signup;
  final_verification_status := CASE
    WHEN trusted_share_signup THEN 'verified'::verification_status
    ELSE 'pending'::verification_status
  END;

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
    id,
    handle,
    phone_number,
    full_name,
    user_type,
    is_verified,
    verification_status,
    trial_ends_at
  )
  VALUES (
    NEW.id,
    generated_handle,
    user_phone,
    user_full_name,
    final_user_type,
    final_is_verified,
    final_verification_status,
    CASE WHEN final_user_type = 'verified'::user_type
      THEN now() + interval '2 months'
      ELSE NULL
    END
  );

  RETURN NEW;
END;
$function$;