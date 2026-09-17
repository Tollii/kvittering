import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	samples: defineTable({
		name: v.string(),
		description: v.string()
	}).index('by_name', ['name'])
});
