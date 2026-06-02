import { useState, useRef, useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  getPet, applyPetDecay, usePetItem,
  getPetInventory, getCoins,
  getOwnedCosmetics, equipPetCosmetic, unequipPetCosmetic,
  setRoomTheme, setPetColorVariant, setPetFrameTheme,
  getAllPets, setActivePetId,
} from '../database/database';
import { COSMETIC_ITEMS, SHOP_ITEM_MAP } from '../constants/itemData';

// Derive which visual/emotion state to show based on stats + active action
function deriveAnimState(stats, actionState) {
  if (actionState) return actionState;
  const min = Math.min(stats.hunger ?? 100, stats.happiness ?? 100, stats.cleanliness ?? 100);
  if (min < 10) return 'sleeping';
  if (min < 30) return 'sad';
  const allGood = stats.hunger > 75 && stats.happiness > 75 && stats.cleanliness > 75;
  if (allGood) return 'happy';
  return 'idle';
}

function buildEquipped(pet) {
  const find = (id) => COSMETIC_ITEMS.find(i => i.id === id) ?? null;
  return {
    hat:       find(pet?.equipped_hat),
    clothes:   find(pet?.equipped_clothes),
    accessory: find(pet?.equipped_accessory),
  };
}

export function usePetState() {
  const [pet, setPet]                   = useState(null);
  const [pets, setPets]                 = useState([]);
  const [coins, setCoins]               = useState(0);
  const [inventory, setInventory]       = useState({});
  const [ownedCosmetics, setOwned]      = useState([]);
  const [actionTick, setActionTick]     = useState(0);
  const [animState, setAnimState]       = useState('idle');

  const actionEmojiRef = useRef('🍖');
  const actionTypeRef  = useRef('eat');
  const actionTimerRef = useRef(null);
  const petRef         = useRef(null);

  const refresh = useCallback(() => {
    const p = applyPetDecay();
    petRef.current = p;
    setPet(p);
    setPets(getAllPets());
    setCoins(getCoins());
    setInventory(getPetInventory());
    setOwned(getOwnedCosmetics());
    if (!actionTimerRef.current) {
      setAnimState(p ? deriveAnimState({
        hunger: p.hunger,
        happiness: p.happiness,
        cleanliness: p.cleanliness,
      }, null) : 'idle');
    }
  }, []);

  useFocusEffect(useCallback(() => {
    refresh();
    return () => {
      clearTimeout(actionTimerRef.current);
      actionTimerRef.current = null;
    };
  }, [refresh]));

  // Trigger an item-use action and show the appropriate anim state
  const triggerAction = useCallback((itemId) => {
    const item = SHOP_ITEM_MAP[itemId];
    if (!item) return;

    clearTimeout(actionTimerRef.current);
    actionEmojiRef.current = item.emoji;
    // map category → base action anim if item has no explicit triggerAnim
    const animMap = { food: 'eating', toy: 'happy', clean: 'surprised' };
    const anim = item.triggerAnim ?? animMap[item.category] ?? 'happy';

    try {
      usePetItem(itemId, item.effect);
      refresh();
      setAnimState(anim);
      setActionTick(t => t + 1);

      // Return to idle/base state after animation window
      actionTimerRef.current = setTimeout(() => {
        actionTimerRef.current = null;
        const p = petRef.current;
        if (p) {
          setAnimState(deriveAnimState({
            hunger: p.hunger,
            happiness: p.happiness,
            cleanliness: p.cleanliness,
          }, null));
        }
      }, 2200);
    } catch (e) {
      throw e; // caller handles Alert
    }
  }, [refresh]);

  const toggleCosmetic = useCallback((item) => {
    const equipped = buildEquipped(petRef.current);
    const isOn = equipped[item.category]?.id === item.id;
    if (isOn) unequipPetCosmetic(item.category);
    else       equipPetCosmetic(item.category, item.id);
    refresh();
  }, [refresh]);

  const changeTheme = useCallback((themeId) => {
    setRoomTheme(themeId);
    refresh();
  }, [refresh]);

  const changeColorVariant = useCallback((variantId) => {
    setPetColorVariant(variantId);
    refresh();
  }, [refresh]);

  const changeFrameTheme = useCallback((themeId) => {
    setPetFrameTheme(themeId);
    refresh();
  }, [refresh]);

  const switchPet = useCallback((petId) => {
    setActivePetId(petId);
    refresh();
  }, [refresh]);

  return {
    pet,
    pets,
    coins,
    inventory,
    ownedCosmetics,
    animState,
    actionTick,
    actionEmojiRef,
    refresh,
    triggerAction,
    toggleCosmetic,
    changeTheme,
    changeColorVariant,
    changeFrameTheme,
    switchPet,
    equipped: pet ? buildEquipped(pet) : { hat: null, clothes: null, accessory: null },
    roomTheme: pet?.room_theme || 'classic',
    colorVariant: pet?.color_variant || 'default',
    frameTheme: pet?.frame_theme || 'purple',
  };
}
