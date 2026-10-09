import { numberEnv, optionalEnv } from '.'

export const databaseUrl = optionalEnv('DATABASE_URL', 'postgres://juji:juji@postgres:5432/juji')
export const addedTracksMax = numberEnv('ADDED_TRACKS_MAX', 10)
