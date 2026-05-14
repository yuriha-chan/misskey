/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class addPasswordResetDelay1778789712000 {
    constructor() {
        this.name = 'addPasswordResetDelay1778789712000';
    }
    async up(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" ADD "passwordResetDelay" INTEGER NOT NULL DEFAULT 0`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "user_profile" DROP COLUMN "passwordResetDelay"`);
    }
}
