import { License } from "./models/License.js";

export default class Database {
  public license = License;
}

/*
public async updateCoins(id: string, amount: number): Promise<boolean> {
	if (!amount || !id || isNaN(amount)) return false;
	await License.updateOne(
		{ _id: id },
		{ $inc: { "economy.money": amount } },
		{ upsert: true }
	);
	return true;
}
*/