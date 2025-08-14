-- Create contact_imports table
CREATE TABLE public.contact_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  is_on_antelog BOOLEAN NOT NULL DEFAULT false,
  antelog_user_id UUID NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.contact_imports ENABLE ROW LEVEL SECURITY;

-- Create policies for contact_imports
CREATE POLICY "Users can view their own contacts" 
ON public.contact_imports 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own contacts" 
ON public.contact_imports 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contacts" 
ON public.contact_imports 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contacts" 
ON public.contact_imports 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for email lookups
CREATE INDEX idx_contact_imports_email ON public.contact_imports(email);
CREATE INDEX idx_contact_imports_user_id ON public.contact_imports(user_id);