use super::models::LocalAccount;
use crate::billing::Entitlement;
use serde::{Deserialize, Serialize};

const LIMIT: usize = 2;

#[derive(Clone, Default, Deserialize, PartialEq, Serialize)]
pub(super) struct Slots {
    active: Vec<String>,
    initialized: bool,
    choose_initial: bool,
    last_downgrade: Option<String>,
}

pub(super) struct ProfileAccess {
    pub slots: Slots,
    pub pro: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileChoice {
    id: String,
    name: String,
    region: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSlots {
    pub pro: bool,
    pub can_add: bool,
    pub locked_count: usize,
    pub choices: Vec<ProfileChoice>,
    pub choose_count: usize,
}

impl ProfileAccess {
    pub fn new(mut slots: Slots, entitlement: Entitlement, accounts: &[LocalAccount]) -> Self {
        slots
            .active
            .retain(|id| accounts.iter().any(|account| &account.id == id));
        let new_downgrade =
            entitlement.ended_grant.is_some() && entitlement.ended_grant != slots.last_downgrade;
        if !entitlement.pro && (!slots.initialized || new_downgrade) {
            slots.initialized = true;
            slots.choose_initial = accounts.len() > LIMIT;
            slots.active = if slots.choose_initial {
                Vec::new()
            } else {
                accounts.iter().map(|account| account.id.clone()).collect()
            };
            if new_downgrade {
                slots.last_downgrade = entitlement.ended_grant;
            }
        }
        Self {
            slots,
            pro: entitlement.pro,
        }
    }

    pub fn allows(&self, id: &str) -> bool {
        self.pro || self.slots.active.iter().any(|active| active == id)
    }

    pub fn require(&self, id: &str) -> Result<(), String> {
        if self.allows(id) {
            Ok(())
        } else {
            Err("This profile is locked. Select it for a free slot or unlock LAAP Pro.".into())
        }
    }

    fn can_add(&self) -> bool {
        self.pro || (!self.slots.choose_initial && self.slots.active.len() < LIMIT)
    }

    pub fn require_space(&self) -> Result<(), String> {
        if self.can_add() {
            Ok(())
        } else {
            Err(
                "Basic supports two active profiles. Choose your profiles or unlock LAAP Pro."
                    .into(),
            )
        }
    }

    pub fn added(&mut self, id: &str) {
        if !self.pro {
            self.slots.active.push(id.to_owned());
        }
    }

    pub fn describe(&self, accounts: &[LocalAccount]) -> ProfileSlots {
        let locked_count = accounts
            .iter()
            .filter(|account| !self.allows(&account.id))
            .count();
        let choose_count = if self.pro {
            0
        } else {
            locked_count.min(LIMIT - self.slots.active.len())
        };
        let choices = if choose_count > 0 {
            accounts
                .iter()
                .filter(|account| !self.allows(&account.id))
                .map(|account| ProfileChoice {
                    id: account.id.clone(),
                    name: account.name.clone(),
                    region: account.region.clone(),
                })
                .collect()
        } else {
            Vec::new()
        };
        ProfileSlots {
            pro: self.pro,
            can_add: self.can_add(),
            locked_count,
            choices,
            choose_count,
        }
    }

    pub fn select(&mut self, ids: Vec<String>, accounts: &[LocalAccount]) -> Result<(), String> {
        let count = self.describe(accounts).choose_count;
        if count == 0
            || ids.len() != count
            || (ids.len() == 2 && ids[0] == ids[1])
            || ids
                .iter()
                .any(|id| self.allows(id) || !accounts.iter().any(|account| &account.id == id))
        {
            return Err("Choose a saved profile for each available Basic slot.".into());
        }
        self.slots.active.extend(ids);
        self.slots.choose_initial = false;
        Ok(())
    }
}
