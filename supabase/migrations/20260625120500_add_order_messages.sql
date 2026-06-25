-- Create order_messages table
CREATE TABLE IF NOT EXISTS public.order_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.users(id),
    message_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

-- Drop policy if it exists
DROP POLICY IF EXISTS "Matched users can exchange messages" ON public.order_messages;

-- Create policy to allow access only if matched and order is not pending
CREATE POLICY "Matched users can exchange messages" ON public.order_messages
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.orders 
        WHERE id = order_messages.order_id 
        AND status != 'pending'
        AND (customer_id = auth.uid() OR driver_id = auth.uid())
    )
);
