-- Add phone number to profiles table
ALTER TABLE public.profiles ADD COLUMN phone_number TEXT;

-- Create enhanced contact_imports table
DROP TABLE IF EXISTS public.contact_imports;
CREATE TABLE public.contact_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  contact_phone TEXT,
  contact_email TEXT,
  import_source TEXT NOT NULL DEFAULT 'manual', -- 'google', 'file', 'manual'
  is_matched BOOLEAN NOT NULL DEFAULT false,
  matched_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create friend_suggestions table
CREATE TABLE public.friend_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggested_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  match_type TEXT NOT NULL CHECK (match_type IN ('phone', 'email')),
  match_value TEXT NOT NULL,
  is_dismissed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, suggested_user_id)
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('friend_suggestion', 'friend_request', 'contact_joined')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  related_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.contact_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for contact_imports
CREATE POLICY "Users can view their own contacts" ON public.contact_imports
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own contacts" ON public.contact_imports
FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contacts" ON public.contact_imports
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contacts" ON public.contact_imports
FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for friend_suggestions
CREATE POLICY "Users can view their own suggestions" ON public.friend_suggestions
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own suggestions" ON public.friend_suggestions
FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own suggestions" ON public.friend_suggestions
FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications" ON public.notifications
FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications" ON public.notifications
FOR UPDATE USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_contact_imports_user_id ON public.contact_imports(user_id);
CREATE INDEX idx_contact_imports_phone ON public.contact_imports(contact_phone) WHERE contact_phone IS NOT NULL;
CREATE INDEX idx_contact_imports_email ON public.contact_imports(contact_email) WHERE contact_email IS NOT NULL;
CREATE INDEX idx_friend_suggestions_user_id ON public.friend_suggestions(user_id);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id, is_read);

-- Triggers for updated_at
CREATE TRIGGER update_contact_imports_updated_at
BEFORE UPDATE ON public.contact_imports
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create mutual friend suggestions
CREATE OR REPLACE FUNCTION public.create_mutual_friend_suggestions()
RETURNS TRIGGER AS $$
DECLARE
  contact_rec RECORD;
  suggestion_exists BOOLEAN;
BEGIN
  -- When a new profile is created or phone number is updated
  IF NEW.phone_number IS NOT NULL THEN
    -- Find contacts who have this phone number
    FOR contact_rec IN 
      SELECT ci.user_id, ci.contact_name
      FROM public.contact_imports ci
      WHERE ci.contact_phone = NEW.phone_number 
      AND ci.user_id != NEW.id
      AND NOT ci.is_matched
    LOOP
      -- Check if suggestion already exists
      SELECT EXISTS(
        SELECT 1 FROM public.friend_suggestions 
        WHERE user_id = contact_rec.user_id 
        AND suggested_user_id = NEW.id
      ) INTO suggestion_exists;
      
      -- Create mutual suggestions if they don't exist
      IF NOT suggestion_exists THEN
        -- Suggestion for contact owner about new user
        INSERT INTO public.friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        VALUES (contact_rec.user_id, NEW.id, 'phone', NEW.phone_number);
        
        -- Suggestion for new user about contact owner (if they have contact owner's info)
        INSERT INTO public.friend_suggestions (user_id, suggested_user_id, match_type, match_value)
        SELECT NEW.id, contact_rec.user_id, 'phone', NEW.phone_number
        WHERE EXISTS(
          SELECT 1 FROM public.contact_imports ci2
          WHERE ci2.user_id = NEW.id 
          AND (ci2.contact_phone = (SELECT phone_number FROM public.profiles WHERE id = contact_rec.user_id)
               OR ci2.contact_email = (SELECT email FROM auth.users WHERE id = contact_rec.user_id))
        );
        
        -- Create notifications
        INSERT INTO public.notifications (user_id, type, title, message, related_user_id)
        VALUES 
        (contact_rec.user_id, 'contact_joined', 'Someone from your contacts joined!', 
         'A contact from your phone book just joined Antelog', NEW.id),
        (NEW.id, 'contact_joined', 'Found a connection!', 
         'Someone who has your contact just connected on Antelog', contact_rec.user_id);
      END IF;
      
      -- Mark contact as matched
      UPDATE public.contact_imports 
      SET is_matched = true, matched_user_id = NEW.id
      WHERE user_id = contact_rec.user_id AND contact_phone = NEW.phone_number;
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for mutual friend suggestions
CREATE TRIGGER trigger_mutual_friend_suggestions
AFTER INSERT OR UPDATE OF phone_number ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.create_mutual_friend_suggestions();