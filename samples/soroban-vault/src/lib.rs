#![no_std]
//! DELIBERATELY VULNERABLE. For AuditLens demos only. Do not deploy.

use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env};

#[contracttype]
pub enum DataKey {
    Admin,
    Token,
    Balance(Address),
}

#[contract]
pub struct Vault;

#[contractimpl]
impl Vault {
    // BUG 1: can be called again by anyone to replace the admin and token.
    pub fn initialize(env: Env, admin: Address, token: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
    }

    pub fn deposit(env: Env, from: Address, amount: i128) {
        from.require_auth();
        // BUG 2: negative amounts are accepted, so a "deposit" can pull credit out of thin air.
        let token = token::Client::new(&env, &Self::token(&env));
        token.transfer(&from, &env.current_contract_address(), &amount);
        let balance = Self::balance(env.clone(), from.clone());
        env.storage().persistent().set(&DataKey::Balance(from), &(balance + amount));
    }

    // BUG 3: no require_auth(), so anyone can withdraw anyone's balance to any address.
    pub fn withdraw(env: Env, from: Address, to: Address, amount: i128) {
        let balance = Self::balance(env.clone(), from.clone());
        if balance < amount {
            panic!("insufficient balance");
        }
        env.storage().persistent().set(&DataKey::Balance(from), &(balance - amount));
        let token = token::Client::new(&env, &Self::token(&env));
        token.transfer(&env.current_contract_address(), &to, &amount);
    }

    // BUG 4: missing authorization. Anyone can make themselves admin.
    pub fn set_admin(env: Env, new_admin: Address) {
        env.storage().instance().set(&DataKey::Admin, &new_admin);
    }

    pub fn sweep(env: Env, to: Address) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let token = token::Client::new(&env, &Self::token(&env));
        let all = token.balance(&env.current_contract_address());
        token.transfer(&env.current_contract_address(), &to, &all);
    }

    pub fn balance(env: Env, user: Address) -> i128 {
        env.storage().persistent().get(&DataKey::Balance(user)).unwrap_or(0)
    }

    fn token(env: &Env) -> Address {
        env.storage().instance().get(&DataKey::Token).unwrap()
    }
}
