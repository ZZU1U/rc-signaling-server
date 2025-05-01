import { z } from 'zod';

// Discriminator field is 'type'
const OfferMessageSchema = z.object({
    uuid: z.string().uuid(),
    to: z.string().uuid(),
    type: z.literal('offer'),
    sdp: z.string(),
});

const AnswerMessageSchema = z.object({
    uuid: z.string().uuid(),
    to: z.string().uuid(),
    type: z.literal('answer'),
    sdp: z.string(),
});

const IceCandidateMessageSchema = z.object({
    uuid: z.string().uuid(),
    to: z.string().uuid(),
    type: z.literal('ice-candidate'),
    candidate: z.any(),
});

const RegisterMessageSchema = z.object({
    uuid: z.string().uuid(),
    type: z.literal('register'),
    jwt: z.string().jwt(),
    role: z.enum(['viewer', 'streamer']),
})

export const MessageSchema = z.discriminatedUnion('type', [
    OfferMessageSchema,
    AnswerMessageSchema,
    IceCandidateMessageSchema,
    RegisterMessageSchema,
]);

// TypeScript types
export type OfferMessage = z.infer<typeof OfferMessageSchema>;
export type AnswerMessage = z.infer<typeof AnswerMessageSchema>;
export type IceCandidateMessage = z.infer<typeof IceCandidateMessageSchema>;
export type RegisterMessage = z.infer<typeof RegisterMessageSchema>;
export type Message = z.infer<typeof MessageSchema>;

export type Streamer = {
	id: string;
	socket: Bun.ServerWebSocket<unknown>;
	viewer: string | null;
};

export type Viewer = {
	id: string;
	socket: Bun.ServerWebSocket<unknown>;
	streamer: string | null;
}
