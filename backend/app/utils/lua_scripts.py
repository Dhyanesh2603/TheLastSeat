"""
Redis Lua scripts for guaranteed atomic operations under extreme concurrency.
"""

# Atomic Seat Reservation Script
# KEYS[1]: seat_reservation_key (e.g. seat:42:reservation)
# KEYS[2]: seat_booked_key (e.g. seat:42:booked)
# ARGV[1]: reservation_id (UUID)
# ARGV[2]: user_id (UUID)
# ARGV[3]: ttl_seconds (e.g. 300)
# Returns:
#   1 -> Reservation successfully granted atomically
#   0 -> Seat is permanently booked
#  -1 -> Seat is already reserved by someone else
RESERVE_SEAT_LUA = """
local res_key = KEYS[1]
local booked_key = KEYS[2]
local res_id = ARGV[1]
local user_id = ARGV[2]
local ttl = tonumber(ARGV[3])

-- 1. Check if seat is permanently booked
if redis.call("EXISTS", booked_key) == 1 then
    return 0
end

-- 2. Check if seat is already reserved
if redis.call("EXISTS", res_key) == 1 then
    local current_val = redis.call("GET", res_key)
    if current_val and string.find(current_val, user_id) then
        return 2 -- Already held by this exact user
    else
        return -1 -- Reserved by another customer
    end
end

-- 3. Atomically grant reservation with TTL
redis.call("SET", res_key, res_id .. ":" .. user_id, "EX", ttl)
return 1
"""

# Atomic Seat Release Script
# KEYS[1]: seat_reservation_key
# ARGV[1]: expected_reservation_id (optional, pass empty to force release)
# Returns:
#   1 -> Released
#   0 -> Did not match or key did not exist
RELEASE_SEAT_LUA = """
local res_key = KEYS[1]
local expected_id = ARGV[1]

if redis.call("EXISTS", res_key) == 0 then
    return 1
end

if expected_id == "" then
    redis.call("DEL", res_key)
    return 1
end

local val = redis.call("GET", res_key)
if val == expected_id or (val and string.find(val, expected_id)) then
    redis.call("DEL", res_key)
    return 1
else
    return 0
end
"""

# Atomic Safe Lock Release Script (Redlock pattern)
# KEYS[1]: lock_key
# ARGV[1]: lock_token
RELEASE_LOCK_LUA = """
if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
else
    return 0
end
"""
