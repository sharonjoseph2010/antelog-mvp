-- Update handle_user_signup function to also extract full_name from metadata
CREATE OR REPLACE FUNCTION public.handle_user_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  base_handle TEXT;
  random_suffix TEXT;
  generated_handle TEXT;
  user_phone TEXT;
  user_full_name TEXT;
BEGIN
  -- Extract phone number and full name from metadata
  user_phone := NEW.raw_user_meta_data->>'phone_number';
  user_full_name := NEW.raw_user_meta_data->>'full_name';
  
  -- Generate a compliant handle if not provided in metadata
  IF NEW.raw_user_meta_data->>'handle' IS NOT NULL THEN
    generated_handle := lower(regexp_replace(NEW.raw_user_meta_data->>'handle', '[^a-z0-9_]', '', 'g'));
  ELSE
    -- Extract email username and clean it
    base_handle := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9_]', '', 'g'));
    -- Generate random 4-char alphanumeric suffix
    random_suffix := substr(md5(random()::text), 1, 4);
    generated_handle := base_handle || random_suffix;
  END IF;
  
  -- Ensure handle is between 3-20 characters
  IF length(generated_handle) < 3 THEN
    generated_handle := generated_handle || substr(md5(random()::text), 1, 3);
  ELSIF length(generated_handle) > 20 THEN
    generated_handle := substr(generated_handle, 1, 16) || substr(md5(random()::text), 1, 4);
  END IF;
  
  -- Create profile for new user with phone number and full name
  INSERT INTO public.profiles (
    id, 
    handle, 
    phone_number,
    full_name,
    user_type,
    is_verified,
    trial_ends_at
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